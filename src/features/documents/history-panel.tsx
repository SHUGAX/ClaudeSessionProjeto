import { Bot, History, UserRound } from "lucide-react";
import { formatTimestamp } from "@/lib/dates";
import type { Translator } from "@/lib/i18n/translate";

export interface HistoryEntry {
  id: string;
  action: string;
  actorName: string | null;
  actorType: string;
  createdAt: string;
  changes: Array<{ field: string; from: string; to: string }>;
}

export interface ExtractionEntry {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  errorCode: string | null;
  durationMs: number | null;
  confidence: number | null;
  createdAt: string;
  current: boolean;
}

export function HistoryPanel({
  entries,
  extractions,
  t,
  locale,
  timezone,
}: {
  entries: HistoryEntry[];
  extractions: ExtractionEntry[];
  t: Translator;
  locale: string;
  timezone: string;
}) {
  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-border bg-surface">
        <h2 className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[13px] font-semibold">
          <History className="size-4" aria-hidden /> {t("review.history")}
        </h2>
        {entries.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">{t("review.noHistory")}</p>
        ) : (
          <ol className="divide-y divide-border" data-testid="document-history">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3 px-4 py-2.5 text-[13px]" data-action={entry.action}>
                {entry.actorType === "system" ? (
                  <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-medium">{t.dynamic(`audit.actions.${entry.action.replace(".", "_")}`, entry.action)}</span>
                    <span className="text-muted-foreground"> · {entry.actorName ?? t("audit.system")}</span>
                  </p>
                  {entry.changes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {entry.changes.slice(0, 8).map((c) => (
                        <li key={c.field} className="break-words">
                          <span className="font-mono">{c.field}</span>: <s>{c.from || "∅"}</s> → <span className="text-foreground">{c.to || "∅"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <time className="tabular shrink-0 text-xs text-muted-foreground" dateTime={entry.createdAt}>
                  {formatTimestamp(entry.createdAt, locale, timezone)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      {extractions.length > 0 ? (
        <section className="rounded-lg border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">{t("review.extractions")}</h2>
          <ul className="divide-y divide-border">
            {extractions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                <span className={x.current ? "font-medium" : "text-muted-foreground"}>
                  {t("review.extractionInfo", {
                    provider: x.provider,
                    model: x.model,
                    prompt: x.promptVersion,
                    duration: x.durationMs != null ? `${(x.durationMs / 1000).toFixed(1)}s` : "—",
                  })}
                  {x.status === "error" ? (
                    <span className="ml-2 text-danger">{t("review.extractionError", { code: x.errorCode ?? "?" })}</span>
                  ) : x.confidence != null ? (
                    <span className="ml-2">
                      · {t("review.confidence")} {Math.round(x.confidence * 100)}%
                    </span>
                  ) : null}
                </span>
                <time className="tabular text-muted-foreground" dateTime={x.createdAt}>
                  {formatTimestamp(x.createdAt, locale, timezone)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
