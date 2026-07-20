# EHQ Production Sanity Suite

Read-only Playwright checks for EHQ **production** environments. Validates login, authentication, and critical navigation paths without creating or modifying data.

This suite is separate from the full [`ehq-playwright`](https://github.com/) smoke/regression framework used on replica environments.

## What it checks

| Spec | Coverage |
|------|----------|
| `01-login-page.spec.ts` | Login page load, form controls, invalid credential error, anonymous homepage |
| `02-participant-flows.spec.ts` | Participant login, logout, enabled engagement tools and action-form availability |
| `03-admin-flows.spec.ts` | Site admin login, dashboard, read-only project admin navigation |
| `04-public-site.spec.ts` | Anonymous homepage and published project page |
| `05-endpoints.spec.ts` | Read-only GET/HEAD checks for public, participant, and site-admin routes |
| `06-write-apis.spec.ts` | Write API checks with dummy data (opt-in, non-production only) |

All tests are tagged `@prod-sanity` and are **read-only**, except `06-write-apis.spec.ts` which is tagged `@write-apis` and excluded from the default run.

### Endpoint health checks

`05-endpoints.spec.ts` runs **134 read-only endpoint checks** and rejects any configured method other than GET/HEAD. Each check declares what it proves: `success`, `availability`, or `access-control`. A 404 accepted by an availability probe is reported as route availability only, never as feature success. Browser flow tests verify access control when an SPA returns a public 200 shell.

Default routes cover homepage, auth pages, published project, participant home, admin dashboard, and project admin. Override or extend the list by copying `endpoints.json.example` to `endpoints.json`:

```json
[
  { "name": "Homepage", "path": "/", "auth": "none" },
  { "name": "Project admin", "path": "/admin/projects/{projectSlug}", "auth": "siteAdmin", "noRedirect": true }
]
```

- `auth`: `none` | `participant` | `siteAdmin`
- `{projectSlug}` is replaced from `PROD_PROJECT_SLUG`
- `noRedirect: true` asserts the exact status without following redirects (useful for auth-gated admin routes)
- `validation`: `success` | `availability` | `rejection` | `access-control`

```bash
# Endpoint checks only (~1–2 min)
npm run test:endpoints
```

### Write API checks

`06-write-apis.spec.ts` covers public, **participant**, and site-admin write routes (**18** checks) with dummy payloads. It is **not** included in `npm run test:sanity`. Successful write checks require an explicit 2xx/3xx response; intentionally invalid archive, publish, registration, and reporting-filter checks are labeled `rejection` and require 4xx. Login and logout are browser flows rather than standalone write APIs. Project routes use `{projectSlug}` from `PROD_PROJECT_SLUG`.

`07-production-write-validation.spec.ts` contains **3 rejection-only** checks for production. Every payload is intentionally invalid and must return 422; any 2xx response fails. The UI automatically selects this safe variant for hosts that are not replica, preprod, staging, or localhost.

Requirements:
- Set `ALLOW_WRITE_TESTS=true` in `.env`
- Target host must be non-production (`replica`, `preprod`, `staging`, or `localhost` in the domain)

```bash
# Write API checks only (~1 min)
npm run test:write

# Production-safe rejection checks
ALLOW_PROD_WRITE_VALIDATION=true npm run test:write:production
```

## Production safety rules

- No create/update/delete of projects, tools, or submissions
- The default endpoint registry is enforced as GET/HEAD-only, including custom `endpoints.json`
- Production write validation is rejection-only; successful dummy writes remain non-production-only
- Use dedicated sanity accounts — not personal or replica test accounts
- Single worker (`workers: 1`) to limit load on production
- No AI healing, session cache, or prerequisite site creation
- Target runtime: under 10 minutes

## Prerequisites

Before your first green run, obtain:

1. Production site URL (`EHQ_PROD_SITE_URL`)
2. Dedicated sanity accounts (participant + site admin minimum)
3. A stable published project slug (`PROD_PROJECT_SLUG`)
4. Confirmation that automated logins from your CI IP ranges are allowed

## Setup

```bash
cp .env.example .env   # fill in production values
npm install
npx playwright install chromium
npm run typecheck
npm run docs:check
```

## Run locally

```bash
# Full sanity suite
npm run test:sanity

# Login page only (needs site URL; credential vars only for full suite)
npm run test:login

# Debug with browser visible
PW_HEADED=true npm run test:headed
```

View HTML report after a run:

```bash
npx playwright show-report
```

Regenerate the CSV inventories after changing either endpoint registry:

```bash
npm run docs:generate
```

## CI (on-demand)

The GitHub Action `.github/workflows/prod-sanity.yml` runs on manual dispatch only. Configure these repository secrets:

| Secret | Description |
|--------|-------------|
| `EHQ_PROD_SITE_URL` | Production site URL |
| `EHQ_PROD_SITE_DOMAIN` | Production site domain |
| `PROD_PARTICIPANT_USERNAME` | Sanity participant username |
| `PROD_PARTICIPANT_PASSWORD` | Sanity participant password |
| `PROD_SITEADMIN_USERNAME` | Sanity site admin username |
| `PROD_SITEADMIN_PASSWORD` | Sanity site admin password |
| `PROD_PROJECT_SLUG` | Published project slug |

Trigger from GitHub: **Actions → Production Sanity → Run workflow**. The HTML report is uploaded as an artifact.

## Relationship to ehq-playwright

| | production sanity_suite | ehq-playwright |
|--|-------------------------|----------------|
| Environment | Production | Replica / staging |
| Data impact | None (read-only) | Creates test artifacts |
| When to run | Post-deploy, incident checks | PR gate, nightly regression |
