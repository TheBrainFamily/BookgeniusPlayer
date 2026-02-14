import { vi } from "vitest";

// Never load local .env files in tests.
vi.mock("dotenv/config", () => ({}));

// Guard direct dotenv usage (dotenv.config()) as well.
vi.mock("dotenv", async () => {
  const actual = await vi.importActual<typeof import("dotenv")>("dotenv");
  const config: typeof actual.config = () => ({ parsed: {} });
  return {
    ...actual,
    config,
    default: { ...(actual as { default?: Record<string, unknown> }).default, config },
  };
});

if (process.env.ALLOW_REAL_API_TESTS !== "1") {
  const blockedKeys = [
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY_ALTERNATIVE",
    "VERTEX_API_KEY",
    "GOOGLE_CLOUD_API_KEY",
    "GOOGLE_VERTEX_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_API_KEY_PRIMARY",
    "ANTHROPIC_API_KEY",
    "XAI_API_KEY",
    "GROQ_API_KEY",
    "MISTRAL_API_KEY",
  ];
  for (const key of blockedKeys) {
    delete process.env[key];
  }
}
