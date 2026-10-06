import Link from "next/link";
import type { ReactNode } from "react";
import { Callout } from "@/components/ui/callout";
import { publicEnv } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { BrandMark } from "./brand";

/** Layout for legal placeholder pages. Content MUST be reviewed by a lawyer. */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/" className="mb-8 inline-block">
        <BrandMark name={publicEnv().NEXT_PUBLIC_APP_NAME} className="text-sm" />
      </Link>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <Callout tone="warning">{t("legal.draftNotice")}</Callout>
      <div className="text-foreground/90 mt-8 space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
      <nav className="border-border text-muted-foreground mt-12 flex gap-4 border-t pt-6 text-[13px]">
        <Link href="/legal/privacy" className="hover:text-foreground">
          {t("legal.privacy")}
        </Link>
        <Link href="/legal/terms" className="hover:text-foreground">
          {t("legal.terms")}
        </Link>
        <Link href="/legal/cookies" className="hover:text-foreground">
          {t("legal.cookies")}
        </Link>
      </nav>
    </div>
  );
}
