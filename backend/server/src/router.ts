import { z } from "zod";
import { procedure, router } from "./trpc";
import { JobStatusSchema, StartPipelineInput } from "../../shared/pipelineTypes";
import { jobs, startPipeline } from "./pipeline";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";
import { setCurrentBook } from "../../src/helpers/getCurrentBook";
import { convertBook } from "../../src/tools/fb2-converter/index";
import { extractInlineImages } from "../../.scripts/extract-inline-images";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DEFAULT_EBOOK_CONVERT = "/Applications/calibre.app/Contents/MacOS/ebook-convert";

async function runEbookConvert(bin: string, inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [inputPath, outputPath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ebook-convert exited with ${code}`))));
  });
}

export const appRouter = router({
  startPipeline: procedure.input(StartPipelineInput).mutation(async ({ input }) => {
    const job = await startPipeline(input);
    return { jobId: job.id, slug: job.slug };
  }),

  // Convert an uploaded EPUB to FB2, generate rich.xml and return it for editing
  prepareFromEpub: procedure
    .input(
      // Either absolute epubPath or both path and explicit slug
      z.object({ epubPath: z.string(), slug: z.string().optional() }),
    )
    .mutation(async ({ input }) => {
      const repoRoot = path.resolve(__dirname, "../../");
      // Ensure we run converters from repo root due to relative paths in tools
      try {
        process.chdir(repoRoot);
      } catch {}
      const epubPath = input.epubPath;
      const slug = input.slug || slugify(path.basename(epubPath, path.extname(epubPath)));
      const bookRoot = path.join(repoRoot, "books-data", slug);
      const inputDir = path.join(bookRoot, "input");
      ensureDir(inputDir);
      ensureDir(path.join(bookRoot, "output"));
      ensureDir(path.join(bookRoot, "temporary-output"));
      const fb2Path = path.join(inputDir, `${slug}.fb2`);
      const bin = process.env.EBOOK_CONVERT_BIN || DEFAULT_EBOOK_CONVERT;
      if (!fs.existsSync(bin)) throw new Error(`ebook-convert not found at ${bin}`);
      await runEbookConvert(bin, epubPath, fb2Path);
      // Generate text/html and rich.xml, then extract images out of data URLs
      setCurrentBook(path.join("books-data", slug));
      console.log("Converting book...");
      convertBook(slug, 1, 0);
      await extractInlineImages({ slug });
      const richPath = path.join(bookRoot, "input", "rich.xml");
      const rich = fs.readFileSync(richPath, "utf8");
      return { slug, rich };
    }),

  getRichXml: procedure.input(z.object({ slug: z.string() })).query(({ input }) => {
    const repoRoot = path.resolve(__dirname, "../../");
    const richPath = path.join(repoRoot, "books-data", input.slug, "input", "rich.xml");
    const rich = fs.readFileSync(richPath, "utf8");
    return { rich };
  }),

  saveRichXml: procedure.input(z.object({ slug: z.string(), rich: z.string() })).mutation(({ input }) => {
    const repoRoot = path.resolve(__dirname, "../../");
    const richPath = path.join(repoRoot, "books-data", input.slug, "input", "rich.xml");
    ensureDir(path.dirname(richPath));
    fs.writeFileSync(richPath, input.rich, "utf8");
    return { ok: true };
  }),

  getJobStatus: procedure.input(z.object({ jobId: z.string() })).query(({ input }) => {
    const job = jobs.get(input.jobId);
    if (!job) throw new Error("Job not found");
    const status: z.infer<typeof JobStatusSchema> = {
      jobId: job.id,
      slug: job.slug,
      currentStep: job.currentStep,
      steps: job.steps,
      logs: job.logs.slice(-200),
      error: job.error,
      downloadUrl: job.downloadUrl,
      packagePath: job.packagePath,
    };
    return status;
  }),
});

export type AppRouter = typeof appRouter;
