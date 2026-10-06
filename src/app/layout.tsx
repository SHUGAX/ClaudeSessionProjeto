import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "DocuFlow";
  return {
    title: { default: appName, template: `%s · ${appName}` },
    description: t("common.appTagline"),
    // Private B2B application: keep it out of search engines.
    robots: { index: false, follow: false },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2a46b8",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, messages, t } = await getI18n();
  return (
    <html lang={locale}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow"
        >
          {t("common.skipToContent")}
        </a>
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
