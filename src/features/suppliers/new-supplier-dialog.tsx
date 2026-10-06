"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/client";
import { SupplierForm } from "./supplier-form";

export function NewSupplierDialog({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> {t("suppliers.new")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t("suppliers.new")}
        closeLabel={t("common.close")}
        className="max-w-2xl"
      >
        <SupplierForm categories={categories} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
