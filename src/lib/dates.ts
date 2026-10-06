/**
 * Business dates (invoice/due dates) are calendar dates without time zone and
 * travel as "YYYY-MM-DD" strings. They are never converted through local time.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Parses common date notations into ISO: "2024-03-15", "15/03/2024",
 * "15-03-2024", "15.03.2024" (day-first, European convention).
 */
export function parseBusinessDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  if (ISO_DATE.test(value)) return isValidIsoDate(value) ? value : null;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (m) {
    const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

/** Today's date in the given IANA time zone, as ISO "YYYY-MM-DD". */
export function todayIso(timeZone = "Europe/Lisbon", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Formats an ISO calendar date for display without timezone shifts. */
export function formatBusinessDate(iso: string | null | undefined, locale: string): string {
  if (!iso || !isValidIsoDate(iso)) return "—";
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Formats a UTC timestamp in the user's time zone. */
export function formatTimestamp(
  value: string | null | undefined,
  locale: string,
  timeZone = "Europe/Lisbon",
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
