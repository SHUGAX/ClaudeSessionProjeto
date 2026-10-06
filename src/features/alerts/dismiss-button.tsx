"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { useTenant } from "@/components/tenant/tenant-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { dismissAlertAction } from "./actions";

export function DismissAlertButton({ alertId }: { alertId: string }) {
  const { t } = useI18n();
  const { slug } = useTenant();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await dismissAlertAction(slug, alertId);
          if (!result.ok) toast(t.dynamic(result.error ?? "errors.body"), "error");
        })
      }
    >
      <X /> {t("alerts.dismiss")}
    </Button>
  );
}
