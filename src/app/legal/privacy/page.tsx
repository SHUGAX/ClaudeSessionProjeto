import { LegalPage } from "@/components/layout/legal-page";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("legal.privacy") };
}

// Structural outline only. Not legal advice; requires professional legal review.
export default async function PrivacyPage() {
  const { t } = await getI18n();
  return (
    <LegalPage title={t("legal.privacy")}>
      <p>[Identificação do prestador / responsável pelo tratamento dos dados de conta — a completar.]</p>
      <h2>1. Papéis no tratamento de dados</h2>
      <p>
        [Modelo provisório] Relativamente aos documentos carregados pelas empresas clientes, a empresa cliente atua como
        responsável pelo tratamento e o prestador como subcontratante, nos termos de um acordo de tratamento de dados
        (DPA) a celebrar. Relativamente aos dados das contas de utilizador, [a definir].
      </p>
      <h2>2. Categorias de dados</h2>
      <ul>
        <li>Dados de conta: nome, email, idioma preferido, registos de acesso.</li>
        <li>Documentos empresariais carregados e dados extraídos dos mesmos.</li>
        <li>Registos de auditoria das ações realizadas na plataforma.</li>
      </ul>
      <h2>3. Subcontratantes</h2>
      <p>[Lista a completar: alojamento da aplicação, base de dados e armazenamento, fornecedor de IA, envio de email.]</p>
      <h2>4. Conservação</h2>
      <p>[Prazos de conservação a definir com o cliente e em função das obrigações legais aplicáveis.]</p>
      <h2>5. Direitos dos titulares</h2>
      <p>[Procedimento para exercício de direitos — a completar.]</p>
      <h2>6. Contactos</h2>
      <p>[Contacto do encarregado de proteção de dados, se aplicável — a completar.]</p>
    </LegalPage>
  );
}
