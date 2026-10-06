import type { Json } from "./database.types";

/**
 * Monetary/numeric values are sent to PostgREST as DECIMAL STRINGS so that no
 * binary floating point conversion happens (PostgreSQL casts them to NUMERIC).
 * The generated types declare NUMERIC columns as `number`, hence this cast.
 */
export function numericParam(value: string | null | undefined): number | null {
  return (value ?? null) as unknown as number | null;
}

/** Reads a NUMERIC value back as a decimal string. Prefer selecting `col::text`. */
export function numericToString(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  return String(value);
}

export function toJson(value: unknown): NonNullable<Json> {
  return value as NonNullable<Json>;
}
