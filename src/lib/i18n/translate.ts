import type { Messages } from "./messages/pt-PT";

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];

export type MessageKey = Paths<Messages>;
export type TranslationVars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: TranslationVars) => string;

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

export function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function createTranslator(messages: Messages, locale: string): TFunction & {
  plural: (key: MessageKey, count: number, vars?: TranslationVars) => string;
  has: (key: string) => boolean;
  dynamic: (key: string, fallback?: string, vars?: TranslationVars) => string;
} {
  const t = ((key: MessageKey, vars?: TranslationVars) =>
    interpolate(lookup(messages, key) ?? key, vars)) as TFunction & {
    plural: (key: MessageKey, count: number, vars?: TranslationVars) => string;
    has: (key: string) => boolean;
    dynamic: (key: string, fallback?: string, vars?: TranslationVars) => string;
  };
  const rules = new Intl.PluralRules(locale);
  // Plural keys are written as "{one}|{other}" alternatives separated by "|".
  t.plural = (key, count, vars) => {
    const raw = lookup(messages, key) ?? key;
    const [one, other] = raw.split("|");
    const chosen = rules.select(count) === "one" ? one : (other ?? one);
    return interpolate((chosen ?? raw).trim(), { count, ...vars });
  };
  t.has = (key) => lookup(messages, key) !== undefined;
  /** For keys computed at runtime (e.g. enum values, error codes). */
  t.dynamic = (key, fallback, vars) => interpolate(lookup(messages, key) ?? fallback ?? key, vars);
  return t;
}

export type Translator = ReturnType<typeof createTranslator>;
