import fs from "fs";
import axios from "axios";
import inquirer from "inquirer";
import RunwayML from "@runwayml/sdk";
import path from "path";
import "dotenv/config";
import { processBoomerangInDirectory } from "../../../.scripts/run-boomerang";

const runwayClient = new RunwayML();

const RUNWAY_MODEL = "gen4_turbo";

const BACKGROUND_RUN = true;

const BACKGROUND_VIDEO_RATIO = "1280:720";
const BACKGROUND_PROMPT =
  "Background video, relaxing, very slow camera zoom in. Slow motion. onward movement. smooth motion.";

const PERSON_PROMPT = "Static camera. Person talking slowly, looking at the camera.";
const PERSON_VIDEO_RATIO = "960:960";
const COST_PER_IMAGE = 1;

type TaskStatus = "SUCCEEDED" | "FAILED" | "CANCELLED" | "RUNNING" | "PENDING" | "THROTTLED";

type ImageMetadata = { fileName: string; promptImage: string };

type VideoTask = {
  id: string;
  fileName: string;
  status: TaskStatus | null;
  output: string[] | null;
  isDownloaded: boolean;
};

type BookDirectory = { name: string; path: string };

type TaskState = { bookTitle: string; tasks: VideoTask[]; completedImages: string[]; timestamp: string };

const STATE_FILE_NAME = "video-conversion-state.json";

const saveState = (bookTitle: string, tasks: VideoTask[], completedImages: string[]): void => {
  const state: TaskState = { bookTitle, tasks, completedImages, timestamp: new Date().toISOString() };

  const statePath = `./books-data/${bookTitle}/${STATE_FILE_NAME}`;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`State saved to ${statePath}`);
};

const loadState = (bookTitle: string): TaskState | null => {
  const statePath = `./books-data/${bookTitle}/${STATE_FILE_NAME}`;

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const stateData = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(stateData) as TaskState;
  } catch (error) {
    console.error(`Failed to load state from ${statePath}:`, error);
    return null;
  }
};

const getCompletedVideos = (videoOutputsPath: string): string[] => {
  if (!fs.existsSync(videoOutputsPath)) {
    return [];
  }

  const files = fs.readdirSync(videoOutputsPath);
  return files.filter((file) => file.endsWith(".mp4")).map((file) => file.replace(".mp4", ".png"));
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

const downloadAndSaveVideo = async (videoUrl: string, fileName: string, videoOutputsPath: string): Promise<void> => {
  try {
    const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
    const videoData = response.data as Buffer;

    if (!fs.existsSync(videoOutputsPath)) {
      fs.mkdirSync(videoOutputsPath, { recursive: true });
    }

    const outputPath = `${videoOutputsPath}/${fileName.replace(/\.[^/.]+$/, "")}.mp4`;
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

const calculateTotalCost = (imageCount: number): number => imageCount * COST_PER_IMAGE;

const confirmTotalCost = async (images: ImageMetadata[]): Promise<boolean> => {
  const totalCost = calculateTotalCost(images.length);

  const { confirmProceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmProceed",
      message: `We will generate ${BACKGROUND_RUN ? BACKGROUND_VIDEO_RATIO : PERSON_VIDEO_RATIO} ratio. The total cost for converting ${images.length} remaining images into videos will be ${totalCost} USD. Do you want to proceed?`,
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

const getImagesToConvert = (bookDir: string, excludeImages: string[] = []): ImageMetadata[] => {
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
  const pngImages = images.filter(
    (image) => image.isFile() && image.name.endsWith(".png") && !excludeImages.includes(image.name),
  );

  return pngImages.map((image) => {
    const imagePath = path.join(imagesPath, image.name);
    const imageBuffer = fs.readFileSync(imagePath);
    const base64String = imageBuffer.toString("base64");
    return { fileName: image.name, promptImage: `data:image/png;base64,${base64String}` };
  });
};

const processVideoTasks = async (tasks: VideoTask[], videoOutputsPath: string, bookTitle: string): Promise<void> => {
  let allTasksCompleted = false;
  let retryDelay = 10000;
  const maxRetryDelay = 30000;
  const retryIncrement = 5000;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  while (!allTasksCompleted) {
    try {
      const taskResponses = await Promise.all(
        tasks.map(async (task) => {
          try {
            return await fetchTaskStatus(task.id);
          } catch (error) {
            console.error(`Error fetching status for task ${task.id}:`, error);
            return null;
          }
        }),
      );

      consecutiveErrors = 0;

      const completedImages: string[] = [];

      for (const response of taskResponses) {
        if (!response) continue;

        const task = tasks.find((t) => t.id === response.id);
        if (task) {
          task.status = response.status as TaskStatus;
          console.log(`Task ${task.fileName} (ID: ${task.id}) status: ${task.status}`);

          if (task.status === "FAILED") {
            console.warn(`The task ${task.fileName} (ID: ${task.id}) failed with message: ${response.failure}`);
          }

          if (response.output && !task.isDownloaded) {
            try {
              task.output = response.output;
              await downloadAndSaveVideo(response.output[0], task.fileName, videoOutputsPath);
              task.isDownloaded = true;
              completedImages.push(task.fileName);
            } catch (error) {
              console.error(`Failed to download video for ${task.fileName}:`, error);
            }
          }
        }
      }

      const completedVideos = getCompletedVideos(videoOutputsPath);
      saveState(bookTitle, tasks, completedVideos);

      allTasksCompleted = tasks.every(
        (task) => task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELLED",
      );

      if (!allTasksCompleted) {
        console.log(`Some tasks are still processing. Checking again in ${retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay + retryIncrement, maxRetryDelay);
      } else {
        console.log("All tasks completed!");
      }
    } catch (error) {
      consecutiveErrors++;
      console.error(`Error in processing loop (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, error);

      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error("Max consecutive errors reached. Saving state and exiting...");
        const completedVideos = getCompletedVideos(videoOutputsPath);
        saveState(bookTitle, tasks, completedVideos);
        throw error;
      }

      console.log(`Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
};

if (require.main === module) {
  (async () => {
    try {
      let bookTitle = process.argv[2];

      const books = getAvailableBooks();

      if (bookTitle) {
        const hasBookExisted = books.find((book) => book.name.toLowerCase().trim() === bookTitle.toLowerCase().trim());
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

      const videoOutputsPath = `./books-data/${bookTitle}/video-outputs`;

      const existingState = loadState(bookTitle);
      const completedVideos = getCompletedVideos(videoOutputsPath);

      let tasks: VideoTask[] = [];
      let imagesToProcess: ImageMetadata[] = [];

      if (existingState) {
        console.log(`Found existing state from ${existingState.timestamp}`);
        console.log(`${completedVideos.length} videos already completed`);

        const { resumeChoice } = await inquirer.prompt([
          {
            type: "list",
            name: "resumeChoice",
            message: "What would you like to do?",
            choices: [
              { name: "Resume from existing tasks", value: "resume" },
              { name: "Check status of existing tasks only", value: "check" },
              { name: "Start fresh (will skip already completed videos)", value: "fresh" },
            ],
          },
        ]);

        if (resumeChoice === "resume") {
          tasks = existingState.tasks.filter((task) => !task.isDownloaded);
          console.log(`Resuming with ${tasks.length} pending tasks`);
        } else if (resumeChoice === "check") {
          tasks = existingState.tasks;
          console.log(`Checking status of ${tasks.length} tasks`);
        } else {
          imagesToProcess = getImagesToConvert(bookTitle, completedVideos);
          console.log(`Starting fresh with ${imagesToProcess.length} images to process`);
        }
      } else {
        imagesToProcess = getImagesToConvert(bookTitle, completedVideos);
        console.log(`No existing state found. ${imagesToProcess.length} images to process`);
      }

      if (imagesToProcess.length > 0) {
        const hasConfirmedCost = await confirmTotalCost(imagesToProcess);

        if (!hasConfirmedCost) {
          process.exit(0);
        }

        await Promise.all(
          imagesToProcess.map(async ({ fileName, promptImage }) => {
            const taskId = await createVideoGenerationTask({
              promptImage,
              promptText: BACKGROUND_RUN ? BACKGROUND_PROMPT : PERSON_PROMPT,
            });
            tasks.push({ id: taskId, fileName, status: null, output: null, isDownloaded: false });
          }),
        );

        console.log(`Created ${imagesToProcess.length} new tasks`);
      }

      if (tasks.length === 0) {
        console.log("No tasks to process. All videos may already be completed.");
        process.exit(0);
      }

      await processVideoTasks(tasks, videoOutputsPath, bookTitle);

      const finalCompletedVideos = getCompletedVideos(videoOutputsPath);
      console.log(`Total videos completed: ${finalCompletedVideos.length}`);

      await processBoomerangInDirectory(videoOutputsPath);
    } catch (error) {
      console.error("Error in main process:", error);
      process.exit(1);
    }
  })();
}
