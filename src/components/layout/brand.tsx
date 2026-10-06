import { FileStack } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <FileStack className="size-4" aria-hidden />
      </span>
      {name}
    </span>
  );
}

export function OrganizationLogo({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-base" }[size];
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- logos come from the configured Supabase public bucket
    return <img src={logoUrl} alt="" className={cn(dims, "rounded-md border border-border bg-white object-contain")} />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(dims, "flex items-center justify-center rounded-md bg-primary-soft font-semibold text-primary")}
    >
      {initials || "?"}
    </span>
  );
}
