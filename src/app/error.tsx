"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    // Details are logged server-side; only the digest is shown for support.
    console.error("client_error_boundary", error.digest);
  }, [error]);
  return (
    <main id="main" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{t("errors.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("errors.body")}</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">ref: {error.digest}</p> : null}
      <Button variant="secondary" className="mt-3" onClick={reset}>
        {t("common.retry")}
      </Button>
    </main>
  );
}
