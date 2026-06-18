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

- Discovered 93+ GET endpoints across public pages, participant views, admin panels, and API v2
- Identified PUT, PATCH, POST, and DELETE API routes
- Crawled the SPA dynamically using Playwright browser context and network interception
- Used ripgrep to extract URLs from HTML and verify slugs across environments

### 3. Test Architecture

- Designed the `EndpointCheck` interface supporting: method, auth level, expected status (single or array), no-redirect, request body, max response time, body contains, and body has key
- Created `src/helpers/endpointCheck.ts` — the core assertion engine
- Created `src/helpers/authenticatedRequest.ts` — session-based auth using browser cookies
- Created `src/config/endpoints.ts` — centralized endpoint registry (125 checks)
- Created `tests/05-endpoints.spec.ts` — Playwright test file iterating all endpoints

### 4. Multi-Layer Validation

| Validation Layer | Description |
|-----------------|-------------|
| Status Code Checks | Verifies HTTP status for all 93 GET routes |
| Write Method Validation | Validates PUT/PATCH/POST/DELETE routes exist without modifying data |
| Performance Assertions | Response time thresholds on critical endpoints |
| Response Body Validation | Confirms JSON APIs return expected keys and HTML pages contain expected structure |
| Static Asset / CDN Checks | Favicon loads, sitemap.xml is valid XML |

### 5. Production Safety Design

- Read-only by design — write operations use empty/invalid payloads to confirm route existence
- Expected status arrays handle cross-environment differences (e.g., Devise routes return 404 on some regions)
- No data is created, modified, or deleted on production

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

- Generated `test-cases-detailed.csv` — 125 test cases with IDs, descriptions, and pass criteria (Excel-ready)
- Generated `test-cases-api-mapping.csv` — endpoint-to-API mapping
- `endpoints.json.example` for custom endpoint configuration

---

## Summary in Numbers

| Metric | Value |
|--------|-------|
| Total test cases | 125 |
| HTTP methods covered | GET, POST, PUT, PATCH, DELETE |
| Regions supported | 5 (AU, EU, UK, CA, US) |
| Validation layers | 5 (status, perf, body, key, redirect) |
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
│   │   └── endpoints.ts          # Endpoint registry (125 checks)
│   └── helpers/
│       ├── endpointCheck.ts      # Core assertion engine
│       ├── authenticatedRequest.ts # Session-based authentication
│       └── cookieConsent.ts      # Cookie consent handler
├── tests/
│   ├── 01-login-page.spec.ts     # Login page UI tests
│   ├── 02-participant-flows.spec.ts # Participant flow tests
│   ├── 03-admin-flows.spec.ts    # Admin flow tests
│   ├── 04-public-site.spec.ts    # Public site tests
│   └── 05-endpoints.spec.ts      # Endpoint health checks (125 tests)
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

1. **Read-only execution** — No production data is ever modified. Write methods send empty/invalid bodies and expect rejection (422/401).
2. **Cross-environment tolerance** — Expected status arrays accommodate regional differences without false failures.
3. **Single config, multi-region** — One codebase tests any EHQ deployment by changing the `.env` or using the UI dropdown.
4. **Self-documenting tests** — Each test title includes what's validated, making reports immediately actionable.
5. **Persistent history** — Every run is saved, enabling trend tracking and regression comparison.

---

*Built with Playwright, TypeScript, Express.js, and vanilla HTML/CSS/JS.*
