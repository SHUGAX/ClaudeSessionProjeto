-- Portuguese invoice QR code (Portaria 195/2020) support.
-- ATCUD is the unique document code assigned via AT; together with the issuer
-- NIF it identifies a document unambiguously (duplicate detection, QR lookup).
alter table public.documents
  add column atcud text check (char_length(atcud) <= 100),
  add column at_qr_payload text check (char_length(at_qr_payload) <= 2000);

create index documents_org_atcud_idx on public.documents (organization_id, atcud) where atcud is not null;
create index documents_org_issuer_number_idx
  on public.documents (organization_id, supplier_tax_id_normalized, document_number_normalized);

comment on column public.documents.atcud is 'ATCUD read from the AT QR code (system-managed)';
comment on column public.documents.at_qr_payload is 'Raw AT QR code payload read from the original (system-managed)';
