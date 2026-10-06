"use client";

import { Bot, Send, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssistantAnswer } from "@/lib/assistant/tools";
import { formatBusinessDate } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/money";
import { askAssistantAction } from "./actions";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer?: AssistantAnswer; error?: string };

export function AssistantChat({ exampleSupplier }: { exampleSupplier: string | null }) {
  const { t, locale } = useI18n();
  const { slug, currency, href } = useTenant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();
  const nextId = useRef(1);
  const money = (v: string | null) => formatMoney(v, currency, locale);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setQuestion("");
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text: q }]);
    startTransition(async () => {
      const result = await askAssistantAction(slug, q);
      setMessages((m) => [
        ...m,
        result.ok
          ? { id: nextId.current++, role: "assistant", answer: result.answer }
          : { id: nextId.current++, role: "assistant", error: result.error },
      ]);
    });
  };

  const describe = (a: AssistantAnswer) => {
    const vars = {
      ...a.vars,
      total: money(a.total),
      period: a.vars.period ? t.dynamic(`assistant.periods.${a.vars.period}`) : "",
      range: a.vars.range ? t.dynamic(`assistant.ranges.${a.vars.range}`) : "",
      categorySuffix: a.vars.category
        ? t("assistant.categorySuffix", { category: String(a.vars.category) })
        : "",
    };
    return t.dynamic(`assistant.answers.${a.answer}`, "", vars);
  };

  const examples = [
    exampleSupplier ? t("assistant.example1", { supplier: exampleSupplier }) : null,
    t("assistant.example2"),
    t("assistant.example3"),
    t("assistant.example4"),
  ].filter((e): e is string => Boolean(e));

  return (
    <div className="flex flex-col gap-4">
      <div
        className="border-border bg-surface flex min-h-80 flex-col gap-4 rounded-lg border p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <Sparkles className="text-primary size-6" aria-hidden />
            <p className="text-[13px] font-medium">{t("assistant.examplesTitle")}</p>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {examples.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => ask(e)}
                  className="border-border text-muted-foreground hover:border-primary/40 hover:text-foreground rounded-full border px-3 py-1.5 text-[13px]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex items-start justify-end gap-2">
              <p className="bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm">
                {m.text}
              </p>
              <UserRound
                className="text-muted-foreground mt-1.5 size-4"
                aria-label={t("assistant.you")}
              />
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2" data-testid="assistant-answer">
              <Bot className="text-primary mt-1.5 size-4 shrink-0" aria-hidden />
              <div className="bg-muted max-w-[90%] rounded-lg px-3 py-2 text-sm">
                {m.error ? (
                  <p className="text-danger">{t.dynamic(m.error, t("assistant.error"))}</p>
                ) : m.answer ? (
                  <>
                    <p>{describe(m.answer)}</p>
                    {m.answer.rows.length > 0 ? (
                      <ul className="divide-border border-border bg-surface mt-2 divide-y rounded border">
                        {m.answer.rows.map((r, i) => {
                          const label = r.label || t("assistant.uncategorized");
                          const target = r.href
                            ? href(
                                r.href.kind === "document"
                                  ? `/documents/${r.href.id}`
                                  : `/suppliers/${r.href.id}`,
                              )
                            : null;
                          const detail =
                            r.detail && /^\d{4}-\d{2}-\d{2}$/.test(r.detail)
                              ? formatBusinessDate(r.detail, locale)
                              : r.detail;
                          return (
                            <li
                              key={`${label}-${i}`}
                              className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]"
                            >
                              <span className="min-w-0 truncate">
                                {target ? (
                                  <Link href={target} className="text-primary hover:underline">
                                    {label}
                                  </Link>
                                ) : (
                                  label
                                )}
                                {detail ? (
                                  <span className="text-muted-foreground ml-2 text-xs">
                                    {detail}
                                  </span>
                                ) : null}
                              </span>
                              {r.value != null ? (
                                <span className="tabular shrink-0 font-medium">
                                  {money(r.value)}
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {m.answer.answer !== "unknown" && m.answer.answer !== "supplier_not_found" ? (
                      <p className="text-muted-foreground mt-2 text-xs">
                        {t("assistant.sourceNote", { count: m.answer.sourceCount })}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ),
        )}
        {pending ? (
          <p className="text-muted-foreground text-[13px]">{t("assistant.thinking")}</p>
        ) : null}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("assistant.placeholder")}
          aria-label={t("assistant.placeholder")}
          maxLength={500}
        />
        <Button type="submit" disabled={pending || question.trim().length < 2}>
          <Send /> {t("assistant.ask")}
        </Button>
      </form>
    </div>
  );
}
