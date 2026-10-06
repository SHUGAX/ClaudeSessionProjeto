import Decimal from "decimal.js";

/**
 * Money handling: values travel as decimal strings ("1234.56") and are only
 * manipulated with Decimal (never JS floating point arithmetic).
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** ISO 4217 minor units for common currencies (default 2). */
const MINOR_UNITS: Record<string, number> = { JPY: 0, KRW: 0, CLP: 0, ISK: 0, BHD: 3, KWD: 3, OMR: 3, TND: 3, JOD: 3 };

export function currencyMinorUnits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

/**
 * Parses an amount written in either international ("1,234.56") or
 * Portuguese/European ("1.234,56", "1 234,56 €") notation into a canonical
 * decimal string. Returns null when the input is not a number.
 */
export function parseAmount(input: string | number | null | undefined): string | null {
  if (input == null) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    // Numbers arriving from JSON are converted via their shortest string form.
    return new Decimal(String(input)).toFixed();
  }
  let s = input.trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s  €$£]|EUR|USD|GBP/gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,']+$/.test(s)) return null;
  s = s.replace(/'/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // The right-most separator is the decimal separator.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandsSep).join("").replace(decimalSep, ".");
  } else if (lastComma !== -1) {
    // Several commas ("1,234,567") are thousands separators; a single comma is
    // the decimal separator (Portuguese notation, e.g. "123,45").
    s = s.split(",").length > 2 ? s.split(",").join("") : s.replace(",", ".");
  } else if (lastDot !== -1) {
    const parts = s.split(".");
    if (parts.length > 2) s = parts.join("");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = new Decimal(s);
  return (negative ? value.negated() : value).toFixed();
}

export function toDecimal(value: string | number | null | undefined): Decimal | null {
  if (value == null || value === "") return null;
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

/** Rounds to the currency's minor units and returns a canonical string. */
export function roundMoney(value: Decimal | string, currency = "EUR"): string {
  return new Decimal(value).toDecimalPlaces(currencyMinorUnits(currency)).toFixed(currencyMinorUnits(currency));
}

export function sumAmounts(values: ReadonlyArray<string | null | undefined>): Decimal {
  return values.reduce<Decimal>((acc, v) => (v ? acc.plus(new Decimal(v)) : acc), new Decimal(0));
}

/** Formats a decimal string for display without converting to a float. */
export function formatMoney(
  value: string | number | null | undefined,
  currency: string,
  locale: string,
): string {
  if (value == null || value === "") return "—";
  const digits = currencyMinorUnits(currency);
  const rounded = new Decimal(value).toDecimalPlaces(digits).toFixed(digits);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      // Intl accepts decimal strings: exact formatting without float conversion.
    }).format(rounded as unknown as number);
  } catch {
    return `${rounded} ${currency}`;
  }
}
