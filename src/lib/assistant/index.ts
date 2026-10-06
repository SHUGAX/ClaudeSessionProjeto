import "server-only";
import { serverEnv } from "@/lib/env.server";
import { GeminiIntentParser } from "./gemini-intents";
import { RuleBasedIntentParser, type IntentParser } from "./intents";

export function getIntentParser(): IntentParser {
  const env = serverEnv();
  if (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY)
    return new GeminiIntentParser(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  return new RuleBasedIntentParser();
}
