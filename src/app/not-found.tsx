import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="tabular text-sm font-semibold text-primary">404</p>
      <h1 className="text-xl font-semibold">{t("errors.notFoundTitle")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("errors.notFoundBody")}</p>
      <Link href="/" className={buttonVariants({ variant: "secondary", className: "mt-3" })}>
        {t("errors.goHome")}
      </Link>
    </main>
  );
}
