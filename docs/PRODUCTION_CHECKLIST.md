# Production checklist

## Platform
- [ ] Supabase production project (EU region), separate from staging/dev
- [ ] Migrations applied (`supabase db push`) and types regenerated
- [ ] Review RLS policies and run `pnpm test:db` against a staging copy
- [ ] `documents` bucket private; `organization-logos` public only for logos
- [ ] Auth: signups disabled, password policy, SMTP configured, recovery template, redirect URLs
- [ ] Consider enabling MFA for platform admins (Supabase Auth TOTP)
- [ ] Point-in-time recovery / backups enabled; **restore tested**
- [ ] Storage backup strategy defined (Supabase Storage is not covered by DB PITR)

## AI
- [ ] Gemini paid tier / Vertex AI with appropriate data-processing terms
- [ ] DPA signed, no-training and retention terms verified, processing location and transfer mechanism documented
- [ ] `GEMINI_MODEL` pinned; extraction quality reviewed with synthetic/consented samples
- [ ] AI quotas per plan configured

## Application
- [ ] All env vars set in Vercel (service role marked sensitive), `.env*` never committed
- [ ] `NEXT_PUBLIC_TENANT_ROUTING=subdomain`, root domain, `APP_URL`, `AUTH_COOKIE_DOMAIN`
- [ ] Domain, wildcard DNS and wildcard TLS certificate verified
- [ ] Email provider (`EMAIL_PROVIDER=resend` or other) with SPF/DKIM/DMARC
- [ ] `CRON_SECRET` set and cron running
- [ ] First SaaS admin created (`pnpm admin:create`)
- [ ] Rate limits reviewed; Supabase Auth rate limits configured
- [ ] Security headers/CSP verified on the production domain (securityheaders.com)

## Verification (production smoke test)
- [ ] Create test tenant from admin, accept invitation, set password
- [ ] Upload a **synthetic** invoice, review, correct, validate
- [ ] Document listed, supplier created, dashboard updated, audit entries present
- [ ] Second tenant user cannot open the first tenant's document (URL/API/subdomain)
- [ ] Original file not reachable without a signed URL
- [ ] Suspend test tenant → access blocked; reactivate

## Operations
- [ ] Monitoring/alerting (Vercel logs, Supabase logs; hook Sentry in `reportError`)
- [ ] Uptime check on `/api/health`
- [ ] Incident response contact and runbook; breach notification procedure
- [ ] Recovery testing scheduled
- [ ] Dependency updates and vulnerability scanning (e.g. Dependabot)

## Legal
- [ ] Privacy policy, terms, cookie policy reviewed by a lawyer (current texts are drafts)
- [ ] DPA template for customers; subprocessor list
- [ ] Retention policy per document type agreed with customers
- [ ] Security review / penetration test before onboarding real customers
