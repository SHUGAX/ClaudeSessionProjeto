import type { Locale } from "../config";
import { en } from "./en";
import { ptPT, type Messages } from "./pt-PT";

export const MESSAGES: Record<Locale, Messages> = {
  "pt-PT": ptPT,
  en,
};

export type { Messages };
