import fs from "fs";
import axios from "axios";
import inquirer from "inquirer";
import RunwayML from "@runwayml/sdk";
import path from "path";
import "dotenv/config";
import { processBoomerangOnFile } from "../../../.scripts/run-boomerang";

const runwayClient = new RunwayML();

const RUNWAY_MODEL = "gen4_turbo";

const BACKGROUND_RUN = true;

const BACKGROUND_VIDEO_RATIO = "1280:720";
const BACKGROUND_PROMPT =
  "Background video, relaxing, very slow camera zoom in. Slow motion. onward movement. smooth motion.";

const PERSON_PROMPT = "Static camera. Person talking slowly, looking at the camera.";
const PERSON_VIDEO_RATIO = "960:960";
const COST_PER_IMAGE = 1;
const CREDITS_PER_10_SECONDS_VIDEO = 50;

type TaskStatus = "SUCCEEDED" | "FAILED" | "CANCELLED" | "RUNNING" | "PENDING" | "THROTTLED";

type ImageMetadata = { fileName: string; promptImage: string };

type VideoTask = {
  id: string | null;
  fileName: string;
  status: TaskStatus | null;
  output: string[] | null;
  isDownloaded: boolean;
};

type BookDirectory = { name: string; path: string };

const getCreditsBalance = async () => {
  try {
    const details = await runwayClient.organization.retrieve();

    return details.creditBalance;
  } catch (error) {
    throw new Error(
      `Failed to get credits balance: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const createVideoGenerationTask = async ({
  promptImage,
  promptText,
}: {
  promptImage: string;
  promptText: string;
}): Promise<string> => {
  try {
    const task = await runwayClient.imageToVideo.create({
      model: RUNWAY_MODEL,
      promptImage,
      ratio: BACKGROUND_RUN ? BACKGROUND_VIDEO_RATIO : PERSON_VIDEO_RATIO,
      promptText,
    });
    return task.id;
  } catch (error) {
    throw new Error(`Failed to create video generation task: ${error}`);
  }
};

const fetchTaskStatus = async (taskId: string) => {
  try {
    return await runwayClient.tasks.retrieve(taskId);
  } catch (error) {
    throw new Error(`Failed to fetch task status: ${error}`);
  }
};

const downloadAndSaveVideo = async (
  videoUrl: string,
  fileName: string,
  videoOutputsPath: string,
): Promise<void> => {
  try {
    const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
    const videoData = response.data as Buffer;

    if (!fs.existsSync(videoOutputsPath)) {
      fs.mkdirSync(videoOutputsPath, { recursive: true });
    }

    const outputPath = `${videoOutputsPath}/${fileName}`;
    fs.writeFileSync(outputPath, videoData);
    console.log(`Video saved to ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to download and save video: ${error}`);
  }
};

const getAvailableBooks = (): BookDirectory[] => {
  const booksDataPath = "./books-data";

  if (!fs.existsSync(booksDataPath)) {
    throw new Error("books-data directory does not exist");
  }

  const items = fs.readdirSync(booksDataPath, { withFileTypes: true });
  return items
    .filter((item) => item.isDirectory())
    .map((dir) => ({ name: dir.name, path: path.join(booksDataPath, dir.name) }));
};

const hasEnoughCreditsAvailable = async (imagesMetadata: ImageMetadata[]): Promise<boolean> => {
  const credits = await getCreditsBalance();
  const imagesCount = imagesMetadata.length;
  const creditsNeeded = imagesCount * CREDITS_PER_10_SECONDS_VIDEO;

  if (credits >= creditsNeeded) {
    console.log(
      `You have ${credits} credits and to convert all images you need ${creditsNeeded}. Proceeding with conversion...`,
    );
    return true;
  } else {
    console.warn(
      `You have only ${credits} and need ${creditsNeeded} credits to convert all images. Exiting...`,
    );
    return false;
  }
};

const calculateTotalCost = (imageCount: number): number => imageCount * COST_PER_IMAGE;

const confirmTotalCost = async (images: ImageMetadata[]): Promise<boolean> => {
  const totalCost = calculateTotalCost(images.length);

  const { confirmProceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmProceed",
      message: `We will generate ${BACKGROUND_RUN ? BACKGROUND_VIDEO_RATIO : PERSON_VIDEO_RATIO} ratio. The total cost for converting ${images.length} images into videos will be ${totalCost} USD. Do you want to proceed?`,
      default: false,
    },
  ]);

  if (!confirmProceed) {
    console.log("Operation cancelled by user.");
    return false;
  }

  const { confirmedPrice } = await inquirer.prompt([
    {
      type: "input",
      name: "confirmedPrice",
      message: `Please confirm by entering the exact cost (${totalCost}) USD: `,
      validate: (input: string) => !isNaN(Number(input)) || "Please enter a valid number",
    },
  ]);

  if (Number(confirmedPrice) !== totalCost) {
    console.log("Price confirmation failed. Operation cancelled.");
    return false;
  }

  console.log("Price confirmed. Proceeding with conversion...");
  return true;
};

const getImagesToConvert = (bookDir: string): ImageMetadata[] => {
  const imagesPath = `./books-data/${bookDir}/output/images`;
  if (!fs.existsSync(imagesPath)) {
    throw new Error(
      `It seems like the ${imagesPath} doesn't exist. Fix it and put all images you want to convert to the ${imagesPath}.`,
    );
  }
  const images = fs.readdirSync(imagesPath, { withFileTypes: true });
  if (!images.length) {
    throw new Error(`There are no images in ${imagesPath}.`);
  }
  const pngImages = images.filter((image) => image.isFile() && image.name.endsWith(".png"));
  // .filter((image) => {
  //   // Match filenames like openai-medium-1-*, openai-medium-2-*, ..., openai-medium-9-*
  //   const match = image.name.match(/^openai-medium-(\d+)-\d+\.png$/);
  //   if (!match) return false;
  //   const chapterNumber = Number(match[1]);
  //   return chapterNumber >= 0 && chapterNumber <= 1000;
  // });

  return pngImages.map((image) => {
    const imagePath = path.join(imagesPath, image.name);
    const imageBuffer = fs.readFileSync(imagePath);
    const base64String = imageBuffer.toString("base64");
    return { fileName: image.name, promptImage: `data:image/png;base64,${base64String}` };
  });
};

export const processVideoTasks = async (
  tasks: VideoTask[],
  videoOutputsPath: string,
): Promise<void> => {
  const tasksWithId = tasks.filter((task) => task.id);

  let allTasksCompleted = false;
  let retryDelay = 10000;
  const maxRetryDelay = 30000;
  const retryIncrement = 5000;
  const boomerangProcesses: Promise<void>[] = [];

  while (!allTasksCompleted) {
    const taskResponses = await Promise.all(
      tasksWithId.map((task) => fetchTaskStatus(task.id as string)),
    );

    for (const response of taskResponses) {
      const task = tasks.find((t) => t.id === response.id);
      if (task) {
        task.status = response.status as TaskStatus;
        console.log(`Task ${task.fileName} (ID: ${task.id}) status: ${task.status}`);

        if (task.status === "FAILED") {
          console.warn(
            `The task ${task.fileName} (ID: ${task.id}) failed with message: ${response.failure}`,
          );
        }

        if (response.output && !task.isDownloaded) {
          task.isDownloaded = true; // Mark as processed to avoid duplicates
          task.output = response.output;

          const fileName = `${task.fileName.replace(/\.[^/.]+$/, "")}.mp4`;

          await downloadAndSaveVideo(response.output[0], fileName, videoOutputsPath);

          const boomerangProcess = processBoomerangOnFile(fileName, videoOutputsPath)
            .then(() => {
              console.log(`Boomerang post-processing for ${fileName} completed.`);
            })
            .catch((error) => {
              console.error(`Boomerang post-processing for ${fileName} failed:`, error);
            });

          boomerangProcesses.push(boomerangProcess);
        }
      }
    }

    allTasksCompleted = tasks.every(
      (task) => task.status === "SUCCEEDED" || task.status === "FAILED",
    );

    if (!allTasksCompleted) {
      console.log(
        `Some tasks are still processing. Checking again in ${retryDelay / 1000} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay + retryIncrement, maxRetryDelay);
    } else {
      console.log(
        "All video generation tasks completed. Waiting for boomerang post-processing to finish...",
      );
      await fs.promises.writeFile(
        path.join(videoOutputsPath, "video-tasks-completed.json"),
        JSON.stringify(tasks, null, 2),
        "utf-8",
      );
      await Promise.all(boomerangProcesses);
      console.log("All tasks completed!");
    }
  }
};

if (require.main === module) {
  (async () => {
    try {
      const bookPath = process.argv[2];
      const splitted = bookPath.split("/");
      // this works if someone provides the path like books_data/something or books_data/something/
      let bookTitle = splitted.pop() || splitted.pop();

      const books = getAvailableBooks();

      if (bookTitle && bookTitle.trim() !== "") {
        // @ts-expect-error - bookTitle is not undefined , typescript error.
        const hasBookExisted = books.find(
          (book) => book.name.toLowerCase().trim() === bookTitle.toLowerCase().trim(),
        );
        if (!hasBookExisted) {
          console.log(
            `The book ${bookTitle} was not found. Please ensure a directory for this book exists in the ./books−data folder and that you have provided the exact directory name.`,
          );
          process.exit(0);
        }
      } else {
        const bookTitleQuestion = await inquirer.prompt([
          {
            type: "list",
            name: "bookTitle",
            message: "Choose the book you want to convert images into videos",
            choices: books.map((book) => ({ name: book.name, value: book.name })),
            loop: false,
          },
        ]);
        bookTitle = bookTitleQuestion.bookTitle;
      }

      const temporaryOutputPath = `./books-data/${bookTitle}/temporary-output`;
      const videoOutputsPath = `./books-data/${bookTitle}/video-outputs`;

      if (!bookTitle) {
        console.log("No book title provided. Please provide the book title.");
        process.exit(0);
      }

      const imageMetadata = getImagesToConvert(bookTitle);

      if (!process.argv[2]) {
        const hasEnoughCredits = await hasEnoughCreditsAvailable(imageMetadata);

        if (!hasEnoughCredits) {
          process.exit(0);
        }

        const hasConfirmedCost = await confirmTotalCost(imageMetadata);

        if (!hasConfirmedCost) {
          process.exit(0);
        }
      } else {
        await new Promise((resolve) => {
          const totalCost = calculateTotalCost(imageMetadata.length);
          console.log(
            `The total cost for converting ${imageMetadata.length} images into videos will be ${totalCost} USD.`,
          );
          console.log(
            `You have 3 seconds to abort this operation! You are running: ${BACKGROUND_RUN ? "BACKGROUND" : "PERSON"} mode`,
          );
          setTimeout(resolve, 3000);
        });
      }

      const tasks: VideoTask[] = [];
      await Promise.allSettled(
        imageMetadata.map(async ({ fileName, promptImage }) => {
          try {
            const taskId = await createVideoGenerationTask({
              promptImage,
              promptText: BACKGROUND_RUN ? BACKGROUND_PROMPT : PERSON_PROMPT,
            });

            tasks.push({ id: taskId, fileName, status: null, output: null, isDownloaded: false });
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.error(
                `Failed to create video generation task for ${fileName}:`,
                error.message,
              );
            } else {
              console.error(`Failed to create video generation task for ${fileName}:`, error);
            }
            tasks.push({ id: null, fileName, status: "FAILED", output: null, isDownloaded: false });
          }
        }),
      );

      await fs.promises.writeFile(
        path.join(temporaryOutputPath, "video-tasks-id.json"),
        JSON.stringify(tasks, null, 2),
        "utf-8",
      );

      await processVideoTasks(tasks, videoOutputsPath);
    } catch (error) {
      console.error("Error in main process:", error);
      process.exit(1);
    }
  })();
}
