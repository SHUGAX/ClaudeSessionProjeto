"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

export interface LineItemDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export function emptyLineItem(): LineItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    description: "",
    quantity: "",
    unitPrice: "",
    taxRate: "",
    taxAmount: "",
    lineTotal: "",
  };
}

export function LineItemsEditor({
  items,
  onChange,
  disabled,
}: {
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const set = (key: string, field: keyof LineItemDraft, value: string) =>
    onChange(items.map((it) => (it.key === key ? { ...it, [field]: value } : it)));

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? <p className="text-[13px] text-muted-foreground">{t("review.lineItems.empty")}</p> : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-1.5 pr-2 font-medium">{t("review.lineItems.description")}</th>
                <th className="w-16 pb-1.5 pr-2 font-medium">{t("review.lineItems.quantity")}</th>
                <th className="w-24 pb-1.5 pr-2 font-medium">{t("review.lineItems.unitPrice")}</th>
                <th className="w-16 pb-1.5 pr-2 font-medium">{t("review.lineItems.taxRate")}</th>
                <th className="w-24 pb-1.5 pr-2 font-medium">{t("review.lineItems.lineTotal")}</th>
                <th className="w-8 pb-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.key} className="align-top">
                  <td className="pb-1.5 pr-2">
                    <Input
                      value={item.description}
                      onChange={(e) => set(item.key, "description", e.target.value)}
                      disabled={disabled}
                      aria-label={`${t("review.lineItems.description")} ${idx + 1}`}
                      className="h-8"
                    />
                  </td>
                  {(["quantity", "unitPrice", "taxRate", "lineTotal"] as const).map((field) => (
                    <td key={field} className="pb-1.5 pr-2">
                      <Input
                        value={item[field]}
                        onChange={(e) => set(item.key, field, e.target.value)}
                        disabled={disabled}
                        inputMode="decimal"
                        aria-label={`${t(`review.lineItems.${field}`)} ${idx + 1}`}
                        className="tabular h-8 text-right"
                      />
                    </td>
                  ))}
                  <td className="pb-1.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled}
                      onClick={() => onChange(items.filter((it) => it.key !== item.key))}
                      aria-label={t("review.lineItems.remove")}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!disabled ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => onChange([...items, emptyLineItem()])}>
            <Plus /> {t("review.lineItems.add")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
