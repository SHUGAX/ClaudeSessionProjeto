import "server-only";
import { GoogleGenAI } from "@google/genai";
import { logger } from "@/lib/observability/logger";
import { normalizeExtraction } from "./normalize";
import {
  INVOICE_PROMPT_VERSION,
  INVOICE_SYSTEM_INSTRUCTION,
  INVOICE_USER_PROMPT,
} from "./prompts/invoice";
import { EXTRACTION_SCHEMA_VERSION, extractionJsonSchema } from "./schema";
import type { DocumentExtractionProvider, ExtractionInput, ExtractionResult } from "./types";

/**
 * Google Gemini implementation (structured JSON output + Zod re-validation).
 * IMPORTANT: confirm the Gemini API terms / DPA / data retention for the
 * account before sending real customer documents (see docs/AI_PROCESSING.md).
 */
export class GeminiExtractionProvider implements DocumentExtractionProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async extractInvoice(input: ExtractionInput): Promise<ExtractionResult> {
    const started = Date.now();
    const base = {
      provider: this.name,
      model: this.model,
      promptVersion: INVOICE_PROMPT_VERSION,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
    };

    let text: string | undefined;
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: Buffer.from(input.bytes).toString("base64"),
                },
              },
              { text: INVOICE_USER_PROMPT },
            ],
          },
        ],
        config: {
          systemInstruction: INVOICE_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: extractionJsonSchema,
          temperature: 0,
          abortSignal: AbortSignal.timeout(this.timeoutMs),
        },
      });
      text = response.text;
      usage = {
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      };
      if (!text) {
        const reason =
          response.promptFeedback?.blockReason ?? response.candidates?.[0]?.finishReason ?? "empty";
        return {
          ok: false,
          ...base,
          errorCode: "blocked",
          errorMessage: `Model returned no content (${String(reason)})`,
          durationMs: Date.now() - started,
        };
      }
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const status = (error as { status?: number }).status;
      const detail = providerErrorDetail(error);
      logger.warn("ai_provider_error", {
        provider: this.name,
        documentId: input.documentId,
        status,
        timeout: isTimeout,
        detail,
      });
      return {
        ok: false,
        ...base,
        errorCode: isTimeout ? "timeout" : "provider_unavailable",
        errorMessage: isTimeout
          ? "The AI provider timed out"
          : `The AI provider request failed${status ? ` (HTTP ${status})` : ""}${detail ? `: ${detail}` : ""}`,
        durationMs: Date.now() - started,
      };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return {
        ok: false,
        ...base,
        errorCode: "invalid_response",
        errorMessage: "The AI provider returned malformed JSON",
        durationMs: Date.now() - started,
      };
    }

    const normalized = normalizeExtraction(raw);
    if (!normalized.ok) {
      return {
        ok: false,
        ...base,
        errorCode: "schema_mismatch",
        errorMessage: `Response did not match the extraction schema: ${normalized.issues.join("; ").slice(0, 400)}`,
        raw,
        durationMs: Date.now() - started,
      };
    }
    return {
      ok: true,
      ...base,
      raw,
      data: normalized.data,
      durationMs: Date.now() - started,
      usage,
    };
  }
}

/**
 * Short, non-sensitive description of a provider error (e.g. "models/x is not
 * found", "API key not valid"). Never contains document content; API keys are
 * masked defensively.
 */
export function providerErrorDetail(error: unknown): string | null {
  if (!(error instanceof Error) || !error.message) return null;
  let message = error.message;
  const jsonStart = message.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart)) as {
        error?: { message?: string; status?: string };
      };
      if (parsed.error?.message) {
        message = `${parsed.error.status ? `${parsed.error.status}: ` : ""}${parsed.error.message}`;
      }
    } catch {
      // keep the raw message
    }
  }
  return message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
