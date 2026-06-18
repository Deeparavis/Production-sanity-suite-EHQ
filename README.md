# EHQ Production Sanity Suite

Read-only Playwright checks for EHQ **production** environments. Validates login, authentication, and critical navigation paths without creating or modifying data.

This suite is separate from the full [`ehq-playwright`](https://github.com/) smoke/regression framework used on replica environments.

## What it checks

| Spec | Coverage |
|------|----------|
| `01-login-page.spec.ts` | Login page load, form controls, invalid credential error, anonymous homepage |
| `02-participant-flows.spec.ts` | Participant login, logout |
| `03-admin-flows.spec.ts` | Site admin login, dashboard, read-only project admin navigation |
| `04-public-site.spec.ts` | Anonymous homepage and published project page |
| `05-endpoints.spec.ts` | HTTP 200 checks for public, participant, and site-admin routes |

All tests are tagged `@prod-sanity` and are **read-only**.

### Endpoint health checks

`05-endpoints.spec.ts` hits each configured route and asserts the expected HTTP status (default **200**). Use this for fast post-deploy smoke checks without full UI flows.

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

```bash
# Endpoint checks only (~1–2 min)
npm run test:endpoints
```

## Production safety rules

- No create/update/delete of projects, tools, or submissions
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
