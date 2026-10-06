import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  labels: { previous: string; next: string; page: string };
}) {
  if (pageCount <= 1) return null;
  const linkCls =
    "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-[13px] hover:bg-muted";
  return (
    <nav className="flex items-center justify-between gap-3 px-4 py-3" aria-label="Paginação">
      <span className="text-muted-foreground text-[13px]">{labels.page}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkCls} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> {labels.previous}
          </Link>
        ) : (
          <span className={cn(linkCls, "pointer-events-none opacity-50")}>
            <ChevronLeft className="size-4" aria-hidden /> {labels.previous}
          </span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={linkCls} rel="next">
            {labels.next} <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(linkCls, "pointer-events-none opacity-50")}>
            {labels.next} <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
