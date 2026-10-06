# AI processing

## Principles

- AI **extracts and classifies**; deterministic code validates, links,
  detects duplicates, authorizes and computes.
- The model must return `null` instead of inventing values.
- AI output is **untrusted input**: schema-constrained, Zod-validated,
  normalised, then shown as a _suggestion_ until a human validates it.
- Every attempt (success or failure) is stored immutably with provider,
  model, prompt version, schema version, duration and tokens.

## Components

| File                              | Role                                                                     |
| --------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/ai/types.ts`             | `DocumentExtractionProvider` interface (`extractInvoice`)                |
| `src/lib/ai/provider.ts`          | selects provider from `AI_PROVIDER`                                      |
| `src/lib/ai/gemini.ts`            | Gemini via `@google/genai`, `responseJsonSchema`, temperature 0, timeout |
| `src/lib/ai/mock.ts`              | offline deterministic provider (dev/tests; supports failure markers)     |
| `src/lib/ai/prompts/invoice.ts`   | versioned system instruction (`invoice-prompt@1.0.0`)                    |
| `src/lib/ai/schema.ts`            | Zod schema + JSON schema (`invoice-extraction-schema@1.0.0`)             |
| `src/lib/ai/normalize.ts`         | decimal strings, ISO dates, ISO currency, IBAN, tax IDs                  |
| `src/lib/documents/pipeline.ts`   | orchestration with injected dependencies                                 |
| `src/lib/documents/repository.ts` | Supabase implementation of those dependencies                            |

## Pipeline

1. **Claim** atomically (`uploaded | failed | review_required`, or stale
   `processing` > 5 min) → `processing`.
2. **Download** the original (service role) — the file is never modified.
3. **Extract** via provider. Amounts are requested as strings; Portuguese
   decimal separators, multi-page documents, several VAT rates,
   supplier-vs-customer and total-vs-VAT distinctions are covered in the prompt.
4. **Persist** the extraction record (also on failure).
5. On failure → document `failed` (retryable), usage counted, audit entry.
6. **Supplier**: link only on identical normalised tax ID; category default
   from the supplier.
7. **Duplicates** (`exact_file`, `same_number`, `same_date_total`).
8. **Validation** (`src/lib/documents/validation.ts`).
9. **Apply** suggested values → `review_required`, `review_status=needs_review`.
10. Audit, usage, alerts refresh.

Retrying creates a new extraction; previous ones remain in the history panel.

## Configuration

```
AI_PROVIDER=gemini | mock
GEMINI_API_KEY=…
GEMINI_MODEL=gemini-2.5-flash
AI_TIMEOUT_MS=90000
```

Changing the prompt or schema **must bump the version constants**.

## Adding a provider

Implement `DocumentExtractionProvider` (e.g. `openai.ts`), reuse
`extractionJsonSchema` / `normalizeExtraction`, register it in `provider.ts`
and add it to the `AI_PROVIDER` enum in `env.server.ts`.

## Data privacy (read before production)

Before sending real client documents to any AI provider, confirm:

- provider terms of service and a **data processing agreement** (DPA);
- **no training** on customer content and the data **retention** period;
- processing **location** and international transfer mechanism (e.g. SCCs);
- that the API tier/product is approved for confidential business data
  (free tiers are generally not appropriate);
- the provider is listed as a subprocessor in customer contracts.

Development and CI use synthetic documents and the mock provider only. Logs
never contain document content or raw AI responses.

## AI assistant (implemented, tool-based)

```
question → intent classification (LLM with function calling)
        → predefined, parameterised tools (e.g. spend_by_supplier(period),
          invoices_due(range), top_categories(period)) executed with the
          USER's Supabase client (RLS applies)
        → LLM phrases the answer ONLY from returned rows, citing documents
```

Implementation: `src/lib/assistant/` — `intents.ts` (Zod-validated tool
union + deterministic pt/en `RuleBasedIntentParser`), `gemini-intents.ts`
(structured output, falls back to rules), `tools.ts` (queries with the user's
client, organization filter, validated documents only, `decimal.js` sums).
The answer text is a translated template filled with computed values — the
LLM never produces numbers. The question text is not logged.

Tools: `spend_by_supplier`, `total_spend` (optionally by category),
`top_suppliers`, `spend_by_category`, `invoices_due` (overdue / 7 / 30 days),
`documents_to_review`. Unknown or ambiguous supplier names produce an explicit
"not found" answer instead of a broader total.
