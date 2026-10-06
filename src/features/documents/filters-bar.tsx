"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/client";
import { SORTS } from "@/lib/documents/sort-keys";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/supabase/types";

export interface FilterValues {
  q?: string;
  status?: string;
  type?: string;
  supplier?: string;
  category?: string;
  from?: string;
  to?: string;
  due?: string;
  min?: string;
  max?: string;
  duplicates?: boolean;
  archived?: boolean;
  sort?: string;
}

/**
 * Plain GET form (works without JavaScript); selects auto-submit when JS is on.
 */
export function DocumentFiltersBar({
  action,
  values,
  suppliers,
  categories,
}: {
  action: string;
  values: FilterValues;
  suppliers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}) {
  const { t } = useI18n();
  const advancedActive = Boolean(
    values.type || values.supplier || values.category || values.from || values.to || values.due || values.min || values.max || values.duplicates || values.archived,
  );
  const [showAdvanced, setShowAdvanced] = useState(advancedActive);
  const autoSubmit = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => e.currentTarget.form?.requestSubmit();

  return (
    <form method="get" action={action} className="flex flex-col gap-3" role="search">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder={t("documents.searchPlaceholder")}
            aria-label={t("common.search")}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select name="status" defaultValue={values.status ?? ""} onChange={autoSubmit} aria-label={t("documents.filters.status")} className="sm:w-44">
            <option value="">{`${t("documents.filters.status")}: ${t("common.all")}`}</option>
            {DOCUMENT_STATUSES.filter((s) => s !== "uploading").map((s) => (
              <option key={s} value={s}>
                {t.dynamic(`documentStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Select name="sort" defaultValue={values.sort ?? "created_desc"} onChange={autoSubmit} aria-label={t("documents.filters.sort")} className="sm:w-52">
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t.dynamic(`documents.sort.${s}`)}
              </option>
            ))}
          </Select>
          <Button
            variant={advancedActive ? "primary" : "secondary"}
            size="icon"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            aria-label={t("common.filters")}
          >
            <SlidersHorizontal />
          </Button>
        </div>
      </div>

      {showAdvanced ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label={t("documents.filters.type")} id="f-type">
            <Select id="f-type" name="type" defaultValue={values.type ?? ""}>
              <option value="">{t("common.all")}</option>
              {DOCUMENT_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t.dynamic(`documentTypes.${d}`)}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label={t("documents.filters.supplier")} id="f-supplier">
            <Select id="f-supplier" name="supplier" defaultValue={values.supplier ?? ""}>
              <option value="">{t("common.all")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label={t("documents.filters.category")} id="f-category">
            <Select id="f-category" name="category" defaultValue={values.category ?? ""}>
              <option value="">{t("common.all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label={t("documents.filters.due")} id="f-due">
            <Select id="f-due" name="due" defaultValue={values.due ?? ""}>
              <option value="">{t("documents.filters.dueAny")}</option>
              <option value="overdue">{t("documents.filters.dueOverdue")}</option>
              <option value="next7">{t("documents.filters.dueNext7")}</option>
              <option value="next30">{t("documents.filters.dueNext30")}</option>
            </Select>
          </FilterField>
          <FilterField label={t("documents.filters.issueFrom")} id="f-from">
            <Input id="f-from" type="date" name="from" defaultValue={values.from} />
          </FilterField>
          <FilterField label={t("documents.filters.issueTo")} id="f-to">
            <Input id="f-to" type="date" name="to" defaultValue={values.to} />
          </FilterField>
          <FilterField label={t("documents.filters.amountMin")} id="f-min">
            <Input id="f-min" name="min" inputMode="decimal" defaultValue={values.min} />
          </FilterField>
          <FilterField label={t("documents.filters.amountMax")} id="f-max">
            <Input id="f-max" name="max" inputMode="decimal" defaultValue={values.max} />
          </FilterField>
          <div className="flex flex-col justify-end gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox name="dup" value="1" defaultChecked={values.duplicates} /> {t("documents.filters.duplicatesOnly")}
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox name="archived" value="1" defaultChecked={values.archived} /> {t("documents.filters.includeArchived")}
            </label>
          </div>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <a href={action} className="text-[13px] text-muted-foreground hover:text-foreground">
              {t("common.clearFilters")}
            </a>
            <Button type="submit" size="sm">
              {t("common.apply")}
            </Button>
          </div>
        </div>
      ) : (
        <button type="submit" className="sr-only">
          {t("common.search")}
        </button>
      )}
    </form>
  );
}

function FilterField({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
