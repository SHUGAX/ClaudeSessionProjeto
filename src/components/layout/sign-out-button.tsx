import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same-origin POST form (no JavaScript required). */
export function SignOutButton({ label, className }: { label: string; className?: string }) {
  return (
    <form action="/auth/signout" method="post" className={className}>
      <button
        type="submit"
        className={cn("inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground")}
      >
        <LogOut className="size-4" aria-hidden />
        {label}
      </button>
    </form>
  );
}
