import { LegalPage } from "@/components/layout/legal-page";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("legal.cookies") };
}

// Reflects the cookies actually set by the application. Requires legal review.
export default async function CookiesPage() {
  const { t } = await getI18n();
  return (
    <LegalPage title={t("legal.cookies")}>
      <p>
        A aplicação utiliza apenas cookies estritamente necessários. Não são utilizados cookies de
        publicidade nem de análise de terceiros.
      </p>
      <h2>Cookies utilizados</h2>
      <ul>
        <li>
          <code>sb-*-auth-token</code> — sessão autenticada do utilizador (necessário).
        </li>
        <li>
          <code>locale</code> — idioma escolhido pelo utilizador (preferência funcional).
        </li>
      </ul>
      <p>[Confirmar a necessidade de banner/consentimento com um jurista antes da produção.]</p>
    </LegalPage>
  );
}
