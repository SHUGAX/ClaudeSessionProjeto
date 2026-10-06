import { LegalPage } from "@/components/layout/legal-page";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("legal.terms") };
}

// Structural outline only. Not legal advice; requires professional legal review.
export default async function TermsPage() {
  const { t } = await getI18n();
  return (
    <LegalPage title={t("legal.terms")}>
      <p>
        [Modelo provisório — os termos contratuais são acordados com cada cliente na proposta
        comercial.]
      </p>
      <h2>1. Objeto do serviço</h2>
      <p>
        Plataforma de gestão e análise de documentos empresariais recebidos pelas empresas clientes.
        O serviço não emite faturas nem constitui software de faturação certificado.
      </p>
      <h2>2. Contas e acessos</h2>
      <p>
        [Regras de criação de contas por convite, responsabilidades do administrador da empresa — a
        completar.]
      </p>
      <h2>3. Utilização de inteligência artificial</h2>
      <p>
        Os dados extraídos automaticamente são sugestões e devem ser revistos e validados por um
        utilizador. O documento original é sempre preservado.
      </p>
      <h2>4. Níveis de serviço, limites e preço</h2>
      <p>[A definir na proposta comercial.]</p>
      <h2>5. Lei aplicável</h2>
      <p>[A completar.]</p>
    </LegalPage>
  );
}
