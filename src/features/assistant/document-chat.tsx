"use client";

import { Bot, Send, Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/assistant/document-qa";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { askDocumentAction } from "./actions";

type UiMessage = ChatMessage & { id: number; source?: "gemini" | "rules"; error?: boolean };

/**
 * Multi-turn conversation about one document. The full conversation is sent
 * with each question so follow-ups ("e o IVA?") keep their context.
 */
export function DocumentChat({
  documentId,
  className,
}: {
  documentId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const { slug } = useTenant();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  const ask = (text: string) => {
    const question = text.trim();
    if (question.length < 2 || pending) return;
    const userMessage: UiMessage = { id: nextId.current++, role: "user", content: question };
    const conversation = [...messages.filter((m) => !m.error), userMessage];
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    startTransition(async () => {
      const result = await askDocumentAction(
        slug,
        documentId,
        conversation.map(({ role, content }) => ({ role, content })),
      );
      setMessages((prev) => [
        ...prev,
        result.ok
          ? {
              id: nextId.current++,
              role: "assistant",
              content: result.answer,
              source: result.source,
            }
          : {
              id: nextId.current++,
              role: "assistant",
              content: t.dynamic(result.error, t("docChat.error")),
              error: true,
            },
      ]);
      requestAnimationFrame(() =>
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
      );
    });
  };

  const suggestions = [
    t("docChat.suggestions.due"),
    t("docChat.suggestions.vat"),
    t("docChat.suggestions.paid"),
    t("docChat.suggestions.supplierYear"),
  ];

  return (
    <section
      className={cn("border-border bg-surface rounded-lg border", className)}
      aria-labelledby="doc-chat-title"
    >
      <div className="border-border border-b px-4 py-2.5">
        <h2 id="doc-chat-title" className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="text-primary size-4" aria-hidden /> {t("docChat.title")}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t("docChat.subtitle")}</p>
      </div>

      <div
        ref={listRef}
        className="flex max-h-96 flex-col gap-3 overflow-y-auto px-4 py-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="border-border text-muted-foreground hover:border-primary/40 hover:text-foreground rounded-full border px-3 py-1.5 text-[13px]"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === "user" ? (
            <p
              key={m.id}
              className="bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-lg px-3 py-2 text-sm"
            >
              {m.content}
            </p>
          ) : (
            <div
              key={m.id}
              className="flex max-w-[92%] items-start gap-2"
              data-testid="doc-chat-answer"
            >
              <Bot className="text-primary mt-1.5 size-4 shrink-0" aria-hidden />
              <div
                className={cn("bg-muted rounded-lg px-3 py-2 text-sm", m.error && "text-danger")}
              >
                <p className="whitespace-pre-line">{m.content}</p>
                {m.source ? (
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {m.source === "gemini" ? t("docChat.sourceAi") : t("docChat.sourceRules")}
                  </p>
                ) : null}
              </div>
            </div>
          ),
        )}
        {pending ? (
          <p className="text-muted-foreground text-[13px]">{t("docChat.thinking")}</p>
        ) : null}
      </div>

      <form
        className="border-border flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("docChat.placeholder")}
          aria-label={t("docChat.placeholder")}
          maxLength={1000}
        />
        <Button
          type="submit"
          disabled={pending || input.trim().length < 2}
          aria-label={t("docChat.send")}
        >
          <Send />
        </Button>
      </form>
    </section>
  );
}
