import { Step } from "../shared/pipelineTypes";

export type StepDependency = { step: Step; deps: Step[] };

export const STEP_DEPENDENCIES: StepDependency[] = [
  { step: "import_epub", deps: [] },
  { step: "create_settings", deps: ["import_epub"] },
  { step: "generate_reference_cards", deps: ["create_settings"] },
  { step: "rewrite_paragraphs", deps: ["generate_reference_cards"] },
  { step: "generate_graphical_style", deps: ["create_settings"] },
  { step: "generate_picture_prompts", deps: ["generate_reference_cards"] },
  { step: "make_chapter_summaries", deps: ["create_settings"] },
  { step: "map_summaries_to_paragraphs", deps: ["make_chapter_summaries"] },
  { step: "generate_embeddings", deps: ["map_summaries_to_paragraphs"] },
  { step: "upload_answer_server_data", deps: ["generate_embeddings"] },
  { step: "generate_backgrounds", deps: ["generate_graphical_style"] },
  {
    step: "generate_entity_pictures",
    deps: ["generate_graphical_style", "generate_picture_prompts"],
  },
];

export function getStepDeps(step: Step): Step[] {
  return STEP_DEPENDENCIES.find((d) => d.step === step)?.deps || [];
}

export function canRunStep(step: Step, completedSteps: Set<Step>): boolean {
  const deps = getStepDeps(step);
  return deps.every((dep) => completedSteps.has(dep));
}

export function getReadySteps(
  allSteps: Step[],
  completedSteps: Set<Step>,
  runningSteps: Set<Step>,
): Step[] {
  return allSteps.filter(
    (step) =>
      !completedSteps.has(step) && !runningSteps.has(step) && canRunStep(step, completedSteps),
  );
}

export type ParallelSchedulerState = {
  completedSteps: Set<Step>;
  runningSteps: Set<Step>;
  failedSteps: Set<Step>;
  stepPromises: Map<Step, Promise<void>>;
};

export function createSchedulerState(): ParallelSchedulerState {
  return {
    completedSteps: new Set(),
    runningSteps: new Set(),
    failedSteps: new Set(),
    stepPromises: new Map(),
  };
}
