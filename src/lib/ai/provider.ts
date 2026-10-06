import "server-only";
import { serverEnv } from "@/lib/env.server";
import { GeminiExtractionProvider } from "./gemini";
import { MockExtractionProvider } from "./mock";
import type { DocumentExtractionProvider } from "./types";

/**
 * Returns the configured extraction provider. To add a provider (OpenAI,
 * Anthropic, a local model...), implement DocumentExtractionProvider and
 * register it here; no other code needs to change.
 */
export function getExtractionProvider(): DocumentExtractionProvider {
  const env = serverEnv();
  switch (env.AI_PROVIDER) {
    case "gemini":
      if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
      return new GeminiExtractionProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL, env.AI_TIMEOUT_MS);
    case "mock":
    default:
      return new MockExtractionProvider();
  }
}
