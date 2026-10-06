import Decimal from "decimal.js";
import { formatMoney } from "@/lib/money";

export interface BarDatum {
  key: string;
  label: string;
  value: string;
  href?: string;
}

/**
 * Accessible horizontal bar chart rendered on the server (no chart library,
 * no client JavaScript). Values are decimal strings.
 */
export function HorizontalBarChart({
  data,
  currency,
  locale,
  emptyLabel,
}: {
  data: BarDatum[];
  currency: string;
  locale: string;
  emptyLabel: string;
}) {
  const max = data.reduce((acc, d) => Decimal.max(acc, new Decimal(d.value).abs()), new Decimal(0));
  if (data.length === 0 || max.isZero())
    return <p className="text-muted-foreground py-6 text-center text-[13px]">{emptyLabel}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => {
        const pct = new Decimal(d.value).abs().div(max).times(100).toDecimalPlaces(1).toNumber();
        const content = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate">{d.label}</span>
              <span className="tabular shrink-0 font-medium">
                {formatMoney(d.value, currency, locale)}
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
              <div
                className="bg-primary/80 h-full rounded-full"
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={d.key}>
            {d.href ? (
              <a href={d.href} className="block rounded hover:opacity-80">
                {content}
              </a>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MonthlyColumnChart({
  data,
  currency,
  locale,
  emptyLabel,
}: {
  data: Array<{ month: string; total: string }>;
  currency: string;
  locale: string;
  emptyLabel: string;
}) {
  const max = data.reduce((acc, d) => Decimal.max(acc, new Decimal(d.total)), new Decimal(0));
  if (max.isZero())
    return <p className="text-muted-foreground py-6 text-center text-[13px]">{emptyLabel}</p>;
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  return (
    <figure>
      <div className="flex h-44 items-end gap-1.5" role="list">
        {data.map((d) => {
          const [y, m] = d.month.split("-").map(Number) as [number, number];
          const label = monthFormat.format(new Date(Date.UTC(y, m - 1, 1)));
          const value = new Decimal(d.total);
          const pct = value.isNegative() ? 0 : value.div(max).times(100).toNumber();
          const formatted = formatMoney(d.total, currency, locale);
          return (
            <div
              key={d.month}
              role="listitem"
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="sr-only">
                {label} {y}: {formatted}
              </span>
              <div
                className="bg-primary/75 group-hover:bg-primary w-full max-w-10 rounded-t transition-colors"
                style={{ height: `${Math.max(pct, value.isZero() ? 0 : 2)}%` }}
                title={`${label} ${y}: ${formatted}`}
                aria-hidden
              />
              <span className="text-muted-foreground text-[10px] uppercase" aria-hidden>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
