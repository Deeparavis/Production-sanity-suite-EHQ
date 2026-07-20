# EHQ Production Sanity Suite — Project Summary

## Overview

The EHQ Production Sanity Suite is an automated post-deployment health check system built with Playwright and TypeScript. It validates that all critical endpoints, APIs, and pages are functioning correctly after every deployment across multiple EHQ regions.

---

## What Was Built

### 1. Project Foundation

- Set up a Playwright + TypeScript project from scratch
- Configured `playwright.config.ts` with JSON reporter for machine-readable results
- Created `.env`-based environment configuration supporting multiple regions (AU, EU, UK, CA, US)
- Built a `tsconfig.json` with proper module resolution

### 2. Endpoint Discovery & Coverage

- Registered 134 GET/HEAD checks across public pages, participant views, admin panels, and API v2
- Identified PUT, PATCH, POST, and DELETE API routes
- Crawled the SPA dynamically using Playwright browser context and network interception
- Used ripgrep to extract URLs from HTML and verify slugs across environments

### 3. Test Architecture

- Designed the `EndpointCheck` interface supporting method, auth, expected status, validation semantics, redirects, request body, performance, and body assertions
- Created `src/helpers/endpointCheck.ts` — the core assertion engine
- Created `src/helpers/authenticatedRequest.ts` — session-based auth using browser cookies
- Created `src/config/endpoints.ts` — centralized read-only endpoint registry (134 checks)
- Created `src/config/writeEndpoints.ts` — separately gated write registry (18 checks)
- Created `src/config/productionWriteEndpoints.ts` — rejection-only production registry (3 checks)
- Created `tests/05-endpoints.spec.ts` — Playwright test file enforcing GET/HEAD-only execution

### 4. Multi-Layer Validation

| Validation Layer | Description |
|-----------------|-------------|
| Success Checks | Requires configured successful status and optional body/performance evidence |
| Availability Probes | Reports optional 404/204 responses without claiming feature success |
| Write Method Validation | Full writes on non-production; rejection-only payloads on production |
| Performance Assertions | Response time thresholds on critical endpoints |
| Response Body Validation | Confirms JSON APIs return expected keys and HTML pages contain expected structure |
| Static Asset / CDN Checks | Favicon loads, sitemap.xml is valid XML |

### 5. Production Safety Design

- The production registry and endpoint spec reject PUT/PATCH/POST/DELETE methods
- Write checks require both `ALLOW_WRITE_TESTS=true` and a non-production hostname
- Expected 4xx responses are labeled rejection checks rather than successful feature checks

### 6. Cross-Region Support

- Tested on 5 environments: AU, EU, UK, CA, US
- Dynamic `{projectSlug}` placeholder resolution per environment
- `.env` file auto-generated from UI inputs

### 7. Web UI Dashboard

- Built an Express.js backend (`server.ts`) with APIs for configure, run, stop, status, report, and history
- Built a frontend with:
  - Site URL selector dropdown (pre-configured regions)
  - Credential input form
  - One-click test execution
  - Live terminal output with animated progress bar
  - Auto-transition to results dashboard on completion
  - Results dashboard with verdict banner, stats cards, pass rate bar, suite breakdown, detailed results table with "Validates" column, and failures panel
  - Run History — all past runs saved and viewable

### 8. Test Reporting

- Playwright JSON reporter generates machine-readable results
- Server parses results into summary stats (total, passed, failed, skipped, pass rate, duration)
- Each test title describes exactly what is validated (e.g., `status=200, perf<5000ms, body~"name"`)
- Validation badges in the UI (colour-coded: blue for status, amber for perf, green for body, purple for key)

### 9. Run History & Persistence

- Every completed run is saved to `run-history/` with full report and metadata
- History view lists all past runs with site URL, timestamp, pass/fail counts, and pass rate
- Click any past run to view its full dashboard

### 10. Documentation & Artefacts

- Generated `test-cases-detailed.csv` — 155 synchronized endpoint mappings with validation semantics
- Generated `test-cases-api-mapping.csv` — generated endpoint-to-API mapping
- Added `npm run docs:generate` and `npm run docs:check` to prevent CSV drift
- `endpoints.json.example` for custom endpoint configuration

---

## Summary in Numbers

| Metric | Value |
|--------|-------|
| Production endpoint checks | 134 GET/HEAD-only |
| Opt-in write checks | 18 |
| Production rejection checks | 3 |
| Generated endpoint mappings | 155 |
| HTTP methods covered | GET in production; POST, PUT, PATCH, DELETE only in non-production write runs |
| Regions supported | 5 (AU, EU, UK, CA, US) |
| Validation semantics | success, availability, rejection, access-control |
| Files created | ~15 |
| Avg. execution time | < 2 minutes |

---

## How to Run

### Option 1: Web UI (Recommended)

```bash
npm run ui
```

Open http://localhost:3000 in your browser, select a site, enter credentials, and click "Run Sanity Suite".

### Option 2: Command Line

```bash
# Run all tests
npx playwright test

# Run only endpoint checks
npx playwright test tests/05-endpoints.spec.ts

# Run headed (visible browser)
npx playwright test --headed --workers=1
```

---

## File Structure

```
production sanity_suite/
├── .env                          # Environment config (site URL, credentials, project slug)
├── server.ts                     # Express backend for the web UI
├── playwright.config.ts          # Playwright configuration
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript config
├── ui/
│   ├── index.html                # Web UI frontend
│   ├── style.css                 # UI styling (light blue theme)
│   └── app.js                    # Frontend logic
├── src/
│   ├── config/
│   │   ├── env.ts                # Environment variable loader
│   │   ├── endpoints.ts          # Read-only endpoint registry (134 checks)
│   │   ├── writeEndpoints.ts     # Opt-in write registry (18 checks)
│   │   └── productionWriteEndpoints.ts # Production rejection registry (3 checks)
│   └── helpers/
│       ├── endpointCheck.ts      # Core assertion engine
│       ├── authenticatedRequest.ts # Session-based authentication
│       └── cookieConsent.ts      # Cookie consent handler
├── tests/
│   ├── 01-login-page.spec.ts     # Login page UI tests
│   ├── 02-participant-flows.spec.ts # Participant flow tests
│   ├── 03-admin-flows.spec.ts    # Admin flow tests
│   ├── 04-public-site.spec.ts    # Public site tests
│   ├── 05-endpoints.spec.ts      # Read-only endpoint health checks
│   ├── 06-write-apis.spec.ts     # Opt-in non-production write checks
│   └── 07-production-write-validation.spec.ts # Rejection-only production checks
├── run-history/                   # Saved test run reports
├── test-cases-detailed.csv        # Test case documentation (Excel)
├── test-cases-api-mapping.csv     # Endpoint-to-API mapping (Excel)
└── endpoints.json.example         # Custom endpoint config template
```

---

## Environments Supported

| Region | Site URL | Project Slug |
|--------|----------|--------------|
| Australia | https://qa_demo.engagementhq.com | test-demo-on-au |
| Europe | https://qa_demo.eu.engagementhq.com | test-project-eu |
| United Kingdom | https://qa_demo.uk.engagementhq.com | 2026-5-production-sanity |
| Canada | https://qa_demo.ca.engagementhq.com | test |
| United States | https://qa_demo.us.engagementhq.com | (configurable) |

---

## Key Design Decisions

1. **Read-only production execution** — The default endpoint suite rejects every method except GET/HEAD.
2. **Explicit semantics** — Optional availability and expected rejection checks are not reported as feature success.
3. **Single config, multi-region** — One codebase tests any EHQ deployment by changing the `.env` or using the UI dropdown.
4. **Self-documenting tests** — Each test title includes what's validated, making reports immediately actionable.
5. **Persistent history** — Every run is saved, enabling trend tracking and regression comparison.

---

*Built with Playwright, TypeScript, Express.js, and vanilla HTML/CSS/JS.*
