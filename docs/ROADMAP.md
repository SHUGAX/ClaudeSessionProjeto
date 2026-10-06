# Roadmap

## Next (high value)

1. **Background processing queue** (Supabase Queues/pgmq or a worker) for
   large batches; the pipeline is already dependency-injected.
2. **Email notifications** for due/overdue invoices (digest per user, opt-in).
3. **Tenant data export** (CSV of validated data + ZIP of originals) and
   retention policies.
4. **MFA** enrollment for admins and optional per-tenant enforcement.
5. **Field highlights**: ask the model for bounding boxes and overlay them in
   the pdf.js viewer.
6. **Assistant**: more tools (comparisons, VAT summaries), plan gating, conversation context.

## Email ingestion (design)

`invoices+{slug}@in.example.com` → inbound provider webhook (signed) →
`/api/inbound/email` verifies signature → resolves tenant by recipient token
(not by display name) → stores each allowed attachment through the same
upload/finalize/process functions with actor type `system` and an
`ingestion_source` audit metadata → sender allow-list per tenant → quarantine
unknown senders.

## Later

- Approval workflows (approver role, multi-step validation).
- Contracts: extension table (`counterparty`, `start_date`, `end_date`,
  `renewal_date`, `renewal_type`, `notice_period_days`, `contract_value`) and
  renewal alerts.
- Receipts, credit-note linking to invoices, delivery-note matching.
- ERP/accounting exports and integrations.
- Custom domains (`organization_domains` + verification).
- Enterprise SSO (SAML/OIDC via Supabase).
- Semantic search (pgvector) on top of structured search.
- Billing integration using `plans` and `organization_usage`.
