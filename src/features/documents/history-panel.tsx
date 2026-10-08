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
  errorMessage: string | null;
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
      <section className="border-border bg-surface rounded-lg border">
        <h2 className="border-border flex items-center gap-2 border-b px-4 py-2.5 text-[13px] font-semibold">
          <History className="size-4" aria-hidden /> {t("review.history")}
        </h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground px-4 py-3 text-[13px]">{t("review.noHistory")}</p>
        ) : (
          <ol className="divide-border divide-y" data-testid="document-history">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex gap-3 px-4 py-2.5 text-[13px]"
                data-action={entry.action}
              >
                {entry.actorType === "system" ? (
                  <Bot className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <UserRound className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-medium">
                      {t.dynamic(`audit.actions.${entry.action.replace(".", "_")}`, entry.action)}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.actorName ?? t("audit.system")}
                    </span>
                  </p>
                  {entry.changes.length > 0 ? (
                    <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                      {entry.changes.slice(0, 8).map((c) => (
                        <li key={c.field} className="break-words">
                          <span className="font-mono">{c.field}</span>: <s>{c.from || "∅"}</s> →{" "}
                          <span className="text-foreground">{c.to || "∅"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <time
                  className="tabular text-muted-foreground shrink-0 text-xs"
                  dateTime={entry.createdAt}
                >
                  {formatTimestamp(entry.createdAt, locale, timezone)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      {extractions.length > 0 ? (
        <section className="border-border bg-surface rounded-lg border">
          <h2 className="border-border border-b px-4 py-2.5 text-[13px] font-semibold">
            {t("review.extractions")}
          </h2>
          <ul className="divide-border divide-y">
            {extractions.map((x) => (
              <li
                key={x.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
              >
                <span className={x.current ? "font-medium" : "text-muted-foreground"}>
                  {t("review.extractionInfo", {
                    provider: x.provider,
                    model: x.model,
                    prompt: x.promptVersion,
                    duration: x.durationMs != null ? `${(x.durationMs / 1000).toFixed(1)}s` : "—",
                  })}
                  {x.status === "error" ? (
                    <span className="text-danger ml-2">
                      {t("review.extractionError", { code: x.errorCode ?? "?" })}
                      {x.errorMessage ? (
                        <span className="mt-0.5 block font-normal break-words">
                          {x.errorMessage}
                        </span>
                      ) : null}
                    </span>
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
