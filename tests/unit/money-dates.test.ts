import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  formatBusinessDate,
  isValidIsoDate,
  parseBusinessDate,
  todayIso,
} from "@/lib/dates";
import { formatMoney, parseAmount, roundMoney } from "@/lib/money";

describe("parseAmount", () => {
  it.each([
    ["1234.56", "1234.56"],
    ["1.234,56", "1234.56"],
    ["1 234,56 €", "1234.56"],
    ["1,234.56", "1234.56"],
    ["123,45", "123.45"],
    ["€ 99", "99"],
    ["-12,50", "-12.5"],
    ["(12.50)", "-12.5"],
    ["1.234.567", "1234567"],
    [0.1, "0.1"],
    [1234.5, "1234.5"],
  ])("parses %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "12a", null, undefined, Number.NaN])("rejects %s", (input) => {
    expect(parseAmount(input as string)).toBeNull();
  });

  it("avoids floating point errors", () => {
    expect(roundMoney("0.1").toString()).toBe("0.10");
    expect(roundMoney("1.005")).toBe("1.01");
  });
});

describe("formatMoney", () => {
  it("formats pt-PT EUR", () => {
    const out = formatMoney("1234.5", "EUR", "pt-PT").replace(/\s/g, " ");
    expect(out).toContain("1234,50");
    expect(out).toContain("€");
  });
  it("respects zero-decimal currencies", () => {
    expect(formatMoney("1234", "JPY", "en")).not.toContain(".00");
  });
  it("renders dash for missing values", () => {
    expect(formatMoney(null, "EUR", "pt-PT")).toBe("—");
  });
});

describe("business dates", () => {
  it("parses day-first European dates", () => {
    expect(parseBusinessDate("15/03/2024")).toBe("2024-03-15");
    expect(parseBusinessDate("1.2.2024")).toBe("2024-02-01");
    expect(parseBusinessDate("2024-02-30")).toBeNull();
    expect(parseBusinessDate("31/02/2024")).toBeNull();
  });
  it("validates ISO dates", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2023-02-29")).toBe(false);
  });
  it("adds days without timezone drift", () => {
    expect(addDaysIso("2024-03-30", 2)).toBe("2024-04-01");
    expect(addDaysIso("2024-03-01", -1)).toBe("2024-02-29");
  });
  it("formats without shifting the calendar day", () => {
    expect(formatBusinessDate("2024-01-01", "pt-PT")).toBe("01/01/2024");
  });
  it("computes today in a time zone", () => {
    expect(todayIso("Europe/Lisbon", new Date("2024-06-30T23:30:00Z"))).toBe("2024-07-01");
  });
});

describe("trimDecimal", () => {
  it("keeps a minimum number of decimals", async () => {
    const { trimDecimal } = await import("@/lib/money");
    expect(trimDecimal("369.0000", 2)).toBe("369.00");
    expect(trimDecimal("2.500000", 0)).toBe("2.5");
    expect(trimDecimal("12.3450", 2)).toBe("12.345");
  });
});
