import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/messages/en";
import { ptPT } from "@/lib/i18n/messages/pt-PT";
import { createTranslator } from "@/lib/i18n/translate";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`),
  );
}

describe("i18n", () => {
  it("English has exactly the same keys as Portuguese", () => {
    expect(keys(en).sort()).toEqual(keys(ptPT).sort());
  });

  it("uses European Portuguese vocabulary", () => {
    const all = keys(ptPT)
      .map(
        (k) =>
          k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], ptPT) as string,
      )
      .join(" ");
    for (const brazilian of [
      "Usuário",
      "usuário",
      "Senha",
      "senha",
      "Configurações",
      "arquivo",
      "tela ",
    ]) {
      expect(all).not.toContain(brazilian);
    }
    expect(all).toContain("Utilizador");
    expect(all).toContain("Palavra-passe");
  });

  it("interpolates and pluralises", () => {
    const t = createTranslator(ptPT, "pt-PT");
    expect(t("common.page", { page: 2, total: 5 })).toBe("Página 2 de 5");
    expect(t.plural("common.results", 1)).toBe("1 resultado");
    expect(t.plural("common.results", 3)).toBe("3 resultados");
    expect(t.dynamic("does.not.exist", "fallback")).toBe("fallback");
  });
});
