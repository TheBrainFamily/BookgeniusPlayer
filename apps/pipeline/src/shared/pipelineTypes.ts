import { z } from "zod";

export const StyleSelectionStatusEnum = z.enum([
  "not_started",
  "awaiting_input",
  "generating_auto_style",
  "generating_user_style",
  "generating_previews",
  "awaiting_choice",
  "complete",
  "timed_out",
]);

export type StyleSelectionStatus = z.infer<typeof StyleSelectionStatusEnum>;

export const GraphicalStyleSchema = z.object({
  backgroundStyle: z.string(),
  periodStyle: z.string(),
  avatarStyle: z.string(),
});

export const StyleSelectionStateSchema = z.object({
  status: StyleSelectionStatusEnum,
  remainingTimeMs: z.number(),
  autoStyle: GraphicalStyleSchema.nullable(),
  userStyle: GraphicalStyleSchema.nullable(),
  previews: z
    .object({
      autoPreviewPath: z.string().nullable(),
      userPreviewPath: z.string().nullable(),
      autoAvatarPath: z.string().nullable(),
      userAvatarPath: z.string().nullable(),
    })
    .nullable(),
  selected: z.enum(["auto", "user"]).nullable(),
});

export type StyleSelectionState = z.infer<typeof StyleSelectionStateSchema>;

export const StepEnum = z.enum([
  "import_epub",
  "create_settings",
  "upload_figures",
  "generate_reference_cards",
  "generate_character_roles",
  "rewrite_paragraphs",
  "generate_graphical_style",
  "generate_picture_prompts",
  "generate_backgrounds",
  "generate_entity_pictures",
  "map_summaries_to_paragraphs",
  "generate_embeddings",
  "upload_answer_server_data",
  "complete",
  "failed",
]);

export type Step = z.infer<typeof StepEnum>;

export const StepLabels: Record<Step, string> = {
  import_epub: "Import EPUB",
  create_settings: "Create Settings",
  upload_figures: "Upload Figures",
  generate_reference_cards: "Generate Reference Cards",
  generate_character_roles: "Generate Character Roles",
  rewrite_paragraphs: "Rewrite Paragraphs",
  generate_graphical_style: "Generate Graphical Style",
  generate_picture_prompts: "Generate Picture Prompts",
  generate_backgrounds: "Generate Backgrounds",
  generate_entity_pictures: "Generate Character Pictures",
  map_summaries_to_paragraphs: "Map Summaries to Paragraphs",
  generate_embeddings: "Generate Embeddings",
  upload_answer_server_data: "Upload Answer Server Data",
  complete: "Complete",
  failed: "Failed",
};

export const JobStatusSchema = z.object({
  jobId: z.string(),
  slug: z.string(),
  currentStep: StepEnum,
  activeSteps: z.array(StepEnum).optional(),
  steps: z.array(
    z.object({
      step: StepEnum,
      status: z.enum(["pending", "running", "done", "error"]),
      startedAt: z.number().optional(),
      endedAt: z.number().optional(),
      message: z.string().optional(),
    }),
  ),
  logs: z.array(z.string()).optional(),
  error: z.string().optional(),
  downloadUrl: z.string().optional(),
  packagePath: z.string().optional(),
  styleSelection: StyleSelectionStateSchema.optional(),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const StartPipelineInput = z.object({
  // Absolute or repo-relative path to uploaded epub (optional when starting from existing FB2)
  epubPath: z.string().optional(),
  // Absolute or repo-relative path to an FB2 file (CLI or server-initiated)
  fb2Path: z.string().optional(),
  // Optional slug; if omitted and epubPath given, it's derived from filename
  slug: z.string().optional(),
});

export type StartPipelineInputType = z.infer<typeof StartPipelineInput>;
