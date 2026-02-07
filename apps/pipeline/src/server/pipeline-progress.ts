import fs from "fs";
import path from "path";
import { type Step, StepEnum } from "../shared/pipelineTypes";

export interface StepProgress {
  status: "done" | "error";
  startedAt: string;
  endedAt: string;
  error?: string;
}

export interface PipelineProgress {
  slug: string;
  startedAt: string;
  updatedAt: string;
  completedSteps: Record<string, StepProgress>;
  lastCompletedStep: string | null;
  lastAttemptedStep: string | null;
}

// Ordered list of step slugs (excluding terminal states)
const STEP_ORDER: Step[] = [
  "import_epub",
  "create_settings",
  "upload_figures",
  "generate_reference_cards",
  "rewrite_paragraphs",
  "generate_graphical_style",
  "generate_picture_prompts",
  "generate_backgrounds",
  "generate_entity_pictures",
  "map_summaries_to_paragraphs",
  "generate_embeddings",
  "upload_answer_server_data",
];

function getProgressFilePath(slug: string): string {
  const repoRoot = path.resolve(__dirname, "../../");
  return path.join(repoRoot, "books-data", slug, "temporary-output", "pipeline-progress.json");
}

export function readProgress(slug: string): PipelineProgress | null {
  const filePath = getProgressFilePath(slug);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as PipelineProgress;
  } catch (e) {
    console.error(`Failed to read progress file for ${slug}:`, e);
    return null;
  }
}

export function writeProgress(slug: string, progress: PipelineProgress): void {
  const filePath = getProgressFilePath(slug);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(progress, null, 2));
}

export function initProgress(slug: string): PipelineProgress {
  const existing = readProgress(slug);
  if (existing) {
    return existing;
  }
  const progress: PipelineProgress = {
    slug,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedSteps: {},
    lastCompletedStep: null,
    lastAttemptedStep: null,
  };
  writeProgress(slug, progress);
  return progress;
}

export function markStepStarted(slug: string, step: Step): void {
  const progress = readProgress(slug) || initProgress(slug);
  progress.lastAttemptedStep = step;
  writeProgress(slug, progress);
}

export function markStepComplete(
  slug: string,
  step: Step,
  startedAt: number,
  endedAt: number,
): void {
  const progress = readProgress(slug) || initProgress(slug);
  progress.completedSteps[step] = {
    status: "done",
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
  };
  progress.lastCompletedStep = step;
  progress.lastAttemptedStep = null;
  writeProgress(slug, progress);
}

export function markStepError(
  slug: string,
  step: Step,
  error: string,
  startedAt: number,
  endedAt: number,
): void {
  const progress = readProgress(slug) || initProgress(slug);
  progress.completedSteps[step] = {
    status: "error",
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    error,
  };
  progress.lastAttemptedStep = step;
  writeProgress(slug, progress);
}

export function getNextStep(slug: string): Step | null {
  const progress = readProgress(slug);
  if (!progress) {
    return STEP_ORDER[0];
  }

  for (const step of STEP_ORDER) {
    const stepProgress = progress.completedSteps[step];
    if (!stepProgress || stepProgress.status !== "done") {
      return step;
    }
  }

  return null; // All steps completed
}

export function getStepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

export function isValidStep(step: string): step is Step {
  return StepEnum.safeParse(step).success && STEP_ORDER.includes(step as Step);
}

export function createRetroactiveProgress(slug: string, lastCompletedStep: Step): PipelineProgress {
  const now = new Date().toISOString();
  const progress: PipelineProgress = {
    slug,
    startedAt: now,
    updatedAt: now,
    completedSteps: {},
    lastCompletedStep,
    lastAttemptedStep: null,
  };

  // Mark all steps up to and including lastCompletedStep as done
  const targetIndex = STEP_ORDER.indexOf(lastCompletedStep);
  for (let i = 0; i <= targetIndex; i++) {
    const step = STEP_ORDER[i];
    progress.completedSteps[step] = { status: "done", startedAt: now, endedAt: now };
  }

  writeProgress(slug, progress);
  return progress;
}

export function getStepOrder(): Step[] {
  return [...STEP_ORDER];
}
