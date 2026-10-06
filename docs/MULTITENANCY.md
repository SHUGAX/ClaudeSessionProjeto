# Multi-tenancy

## Model

```
auth.users ─1:1─ profiles ─< organization_members >─ organizations ─< (all tenant data)
```

A user may belong to several organizations with different roles. Tenant data
always carries `organization_id`.

## Hosts and routing (`src/proxy.ts`, `src/lib/tenancy/host.ts`)

| Host                                              | Meaning                                    | Internal route                               |
| ------------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| `example.com`, `www.`, `app.`                     | central app (login, selector, invitations) | as is                                        |
| `admin.example.com`                               | SaaS admin                                 | `/admin/…` (central auth pages stay central) |
| `{slug}.example.com`                              | tenant                                     | `/t/{slug}/…`                                |
| reserved names (`api`, `docs`, `mail`, `auth`, …) | central                                    | as is                                        |
| nested / malformed subdomain                      | rejected                                   | 404                                          |
| unknown host (e.g. `*.vercel.app` preview)        | central                                    | as is                                        |

Global paths are never rewritten: `/api`, `/auth`, `/legal`, `/invite`,
`/_next`, static files. Requests for `/t/…` or `/admin` on a tenant host return
404; on the central host in subdomain mode `/t/{slug}/x` redirects to
`{slug}.example.com/x`.

`NEXT_PUBLIC_TENANT_ROUTING=path` (development/previews) serves tenants at
`/t/{slug}` on a single host.

## Sessions across subdomains

In subdomain mode set `AUTH_COOKIE_DOMAIN=.example.com`: the Supabase session
cookie is shared by `app.`, `admin.` and tenant subdomains, so one sign-in
works everywhere. The cookie grants **no** tenant access by itself.

## Login flows

- **Central** (`app.example.com/login`): after authentication → one active
  organization: redirect to its subdomain; several: organization selector;
  none but platform admin: `/admin`; none: "no access".
- **Tenant** (`empresa.example.com`): unauthenticated → tenant-branded login
  (name/logo from `get_tenant_public_info`); authenticated non-member →
  "Acesso negado"; suspended organization → suspension notice; unknown slug → 404.

## Slugs

Lowercase letters/digits/hyphens, 3–63 chars, no leading/trailing or double
hyphen, not reserved (`src/lib/tenancy/slug.ts` ≡ `public.is_reserved_slug`).
Slugs are set by the platform admin and immutable for tenant users.

## Local subdomain testing

Browsers resolve `*.localhost`, but cookies cannot be shared on `localhost`.
Use a test domain that resolves to 127.0.0.1 (e.g. `lvh.me`, or a hosts-file
entry), then:

```
NEXT_PUBLIC_TENANT_ROUTING=subdomain
NEXT_PUBLIC_ROOT_DOMAIN=lvh.me:3000
APP_URL=http://app.lvh.me:3000
AUTH_COOKIE_DOMAIN=.lvh.me
```

`e2e/subdomain.spec.ts` automates this with Chromium host-resolver rules.

## Limits

Effective limit = organization override ?? plan value ?? unlimited
(`public.organization_limits`). Enforced before invitations (users), uploads
(documents/month, storage) and AI processing (AI calls/month), with clear
messages to the user.

## Future: custom domains

Add `organization_domains (domain unique, organization_id, verified_at)` and a
lookup in `resolveHost` for unknown hosts; issue certificates via the hosting
provider's domains API.
