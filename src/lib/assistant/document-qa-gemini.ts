import "server-only";
import { GoogleGenAI } from "@google/genai";
import { withRetries } from "@/lib/ai/gemini";
import { serverEnv } from "@/lib/env.server";
import type { Locale } from "@/lib/i18n/config";
import { logger } from "@/lib/observability/logger";
import type { DocumentContext } from "./document-context";
import { answerFromRules, documentQaInstruction, type ChatMessage } from "./document-qa";

export interface DocumentAnswer {
  answer: string;
  source: "gemini" | "rules";
}

/**
 * Answers a conversation about one document. Uses Gemini (grounded on the
 * document context only) when configured, otherwise — or if the model fails —
 * deterministic rules, so a question always gets a factual answer.
 */
export async function answerDocumentQuestion(
  context: DocumentContext,
  history: ChatMessage[],
  locale: Locale,
): Promise<DocumentAnswer> {
  const question = history[history.length - 1]?.content ?? "";
  const env = serverEnv();
  if (env.AI_PROVIDER !== "gemini" || !env.GEMINI_API_KEY) {
    return { answer: answerFromRules(context, question, locale), source: "rules" };
  }

  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await withRetries(Date.now() + 30_000, (signal) =>
      client.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: history.slice(-12).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content.slice(0, 1000) }],
        })),
        config: {
          systemInstruction: documentQaInstruction(context, locale),
          temperature: 0.2,
          maxOutputTokens: 600,
          abortSignal: signal,
        },
      }),
    );
    const text = response.text?.trim();
    if (text) return { answer: text.slice(0, 3000), source: "gemini" };
  } catch (error) {
    logger.warn("document_qa_llm_failed", { status: (error as { status?: number }).status });
  }
  return { answer: answerFromRules(context, question, locale), source: "rules" };
}
