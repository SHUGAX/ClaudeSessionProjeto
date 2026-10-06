/**
 * Portuguese NIF (Número de Identificação Fiscal) checksum validation.
 * Deterministic modulo-11 algorithm. A failed checksum should be treated as a
 * WARNING by callers: suppliers may be foreign and use other tax ID formats.
 */
const VALID_FIRST_DIGITS = new Set(["1", "2", "3", "5", "6", "8", "9"]);
const VALID_PREFIXES_9 = new Set([
  "45",
  "70",
  "71",
  "72",
  "74",
  "75",
  "77",
  "78",
  "79",
  "90",
  "91",
  "98",
  "99",
]);

export function isValidPortugueseNif(input: string): boolean {
  const nif = input.replace(/\s+/g, "").replace(/^PT/i, "");
  if (!/^\d{9}$/.test(nif)) return false;

  const first = nif[0] ?? "";
  const firstTwo = nif.slice(0, 2);
  if (!VALID_FIRST_DIGITS.has(first) && !VALID_PREFIXES_9.has(firstTwo)) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(nif[i]) * (9 - i);
  }
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;
  return checkDigit === Number(nif[8]);
}

/** True when the value looks like a Portuguese NIF (9 digits, optional PT prefix). */
export function looksLikePortugueseNif(input: string): boolean {
  return /^(PT)?\d{9}$/i.test(input.replace(/[\s.-]+/g, ""));
}
