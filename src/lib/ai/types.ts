import type { InvoiceExtraction } from "./schema";

export interface ExtractionInput {
  bytes: Uint8Array;
  mimeType: string;
  /** Only used for logging context; never sent to logs with content. */
  documentId: string;
}

export interface ExtractionSuccess {
  ok: true;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  /** Raw JSON returned by the model (stored for traceability, never logged). */
  raw: unknown;
  data: InvoiceExtraction;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ExtractionFailure {
  ok: false;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  errorCode:
    | "provider_unavailable"
    | "timeout"
    | "invalid_response"
    | "schema_mismatch"
    | "blocked"
    | "configuration";
  /** Sanitised message: never contains document content or secrets. */
  errorMessage: string;
  raw?: unknown;
  durationMs: number;
}

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

/** Provider-agnostic interface used by the rest of the application. */
export interface DocumentExtractionProvider {
  readonly name: string;
  readonly model: string;
  extractInvoice(input: ExtractionInput): Promise<ExtractionResult>;
}
