# Implementation Plan: Manual Price Report Email

**Branch**: `003-send-report-email` | **Date**: 2026-03-17 | **Spec**: [/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/spec.md)
**Input**: Feature specification from `/specs/003-send-report-email/spec.md`

## Summary

Add a dedicated dashboard page for previewing and sending the current stored price report to one to three manual recipients without refreshing prices first. The implementation will extract shared report payload, email-template rendering, and email-delivery logic into a reusable workspace package, make the refresh-only and send-only workflow boundaries explicit, add a persisted manual-send ledger in PostgreSQL, and use Redis-backed reviewed-preview caching plus a global send lock so the new direct web-request flow can enforce the 3-sends-per-10-minutes and 99-recipient-per-day safeguards atomically while preserving the existing queue-driven combined and scheduled digest behavior.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16, Node.js runtime for web and worker  
**Primary Dependencies**: Next.js App Router, Drizzle ORM, BullMQ, Ioredis, Resend, React Email, `@react-email/render`, Zod, date-fns, `date-fns-tz`  
**Storage**: PostgreSQL 18 for products, price history, settings, and the new manual-send ledger; Redis 8 for queueing plus preview-cache and global send-lock coordination  
**Testing**: Vitest + React Testing Library in `apps/web/src/test/`, plus focused worker regression coverage for digest composition in `apps/worker/src/jobs/`  
**Target Platform**: Next.js dashboard and Node worker running in Linux containers for local Docker and production Coolify deployment  
**Project Type**: Monorepo web application plus background worker with one new shared workspace package  
**Performance Goals**: Preview loads from stored data in a single request without triggering price checks; the preview uses the same email template that will be sent; direct manual sends return provider success or failure in the initiating request; low-volume manual sends may be serialized to guarantee quota correctness  
**Constraints**: No product refresh or new price records in the report-only flow; active products only; 1-3 unique recipients; `To` for one recipient and `BCC` for multiple; atomic 3-per-10-minute and 99-recipient-per-day enforcement; no recipient-address persistence; existing combined and scheduled flows must stay refresh-first  
**Scale/Scope**: One global manual report page, two new web endpoints, one new DB table, one shared reporting package, and regression coverage across manual UI, API, and worker reuse

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Architecture Fit**: Pass with explicit justification. Implementation stays in `apps/web`, `apps/worker`, `packages/db`, and `specs/`, plus one new shared package `packages/reporting` to avoid brittle app-to-app imports for report payload, email rendering, and delivery logic.
- **Typed Maintainability**: Pass. The design centralizes report types, email rendering, preview artifact models, recipient validation, and send-limit services into focused TypeScript modules; date boundary logic uses `date-fns-tz` instead of ad hoc timezone math.
- **Data Safety**: Pass. Persistence work is limited to a new Drizzle-managed `manualReportSends` table and query-builder-based reads/inserts. Atomic limit coordination is handled with Redis locking so no raw SQL locking exception is needed.
- **Verification Plan**: Pass. Automated coverage will verify US1 preview/send validation, same-template preview rendering, retry behavior, and no-refresh guarantees; US2 navigation/page access; and US3 regression of the existing combined and scheduled digest orchestration. Manual checks will confirm live provider-failure surfacing, limit countdown messaging, and unchanged dashboard-trigger behavior.
- **Operational Readiness**: Pass. No new environment variable names are required, but the web runtime must now have `RESEND_API_KEY`, `EMAIL_FROM`, `REDIS_URL`, and timezone fallback envs available because report-only delivery happens in the web request path. Scheduler behavior remains unchanged. Logging should distinguish preview load, limit block, send success, and provider failure cases.

## Project Structure

### Documentation (this feature)

```text
specs/003-send-report-email/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/src/app/(main)/dashboard/
├── _components/sidebar/
│   └── nav-main.tsx
├── send-report/
│   ├── _components/
│   │   ├── manual-report-page-client.tsx
│   │   ├── manual-report-preview.tsx
│   │   └── recipient-input.tsx
│   └── page.tsx
└── ...

apps/web/src/app/api/manual-report/
├── preview/route.ts
└── send/route.ts

apps/web/src/lib/manual-report/
├── preview-cache.ts
├── recipient-list.ts
├── send-limits.ts
└── timezone.ts

apps/web/src/navigation/sidebar/
└── sidebar-items.ts

apps/web/src/test/dashboard/
├── send-report-page.test.tsx
├── send-report-routes.test.ts
├── shared-reporting.test.ts
└── digest-trigger-route.test.ts

apps/worker/src/
├── jobs/
│   ├── sendDigest.ts
│   └── sendDigest.test.ts
└── services/
    └── update-prices.ts

packages/db/src/
├── index.ts
└── schema.ts

packages/reporting/
├── package.json
└── src/
    ├── index.ts
    ├── report-snapshot.ts
    ├── price-digest-email.tsx
    ├── render-price-report.ts
    └── send-price-report.ts
```

**Structure Decision**: Use a new shared workspace package `packages/reporting` for report payload generation, React Email rendering, and report sending because both `apps/web` and `apps/worker` need the same server-side behavior. Keep quota enforcement, reviewed-preview caching, navigation, and page UX inside `apps/web`; keep refresh-only queue orchestration inside `apps/worker`; keep persistence in `packages/db`.

## Phases

### Phase 1: Shared Reporting Foundation

- Create `packages/reporting` and move the digest email template, HTML rendering helper, and report snapshot-building logic out of worker-only modules.
- Expose typed helpers for building an active-products report payload from stored data, rendering reviewed preview HTML from the shared email template, and sending that payload through Resend with the existing sender identity and email format.
- Refactor `apps/worker/src/jobs/sendDigest.ts` to compose an explicit refresh-only workflow boundary with the shared report-sending helpers instead of owning its own email transformation path.
- Add the `manualReportSends` Drizzle table to `packages/db` for completed manual report-only sends.

### Phase 2: Manual Report Server Flow

- Add a preview loader that builds the current report payload without refreshing prices, renders the shared email HTML, computes current safeguard status, and stores the reviewed preview artifact in Redis with a short-lived preview id so sends can reuse the exact reviewed version.
- Add recipient parsing and validation for 1-3 comma-separated unique email addresses.
- Add a direct-send API that acquires a global Redis lock, re-checks both safeguards atomically, sends the cached reviewed preview artifact via Resend, persists a completed send record, and returns immediate success or provider failure to the page.
- Add timezone utilities so daily quota reset uses `SCHEDULER_TIMEZONE`, then `TZ`, then `UTC`.

### Phase 3: Dashboard UI and Navigation

- Add a new sidebar item labeled `Send Report to Emails`.
- Build the dedicated dashboard page with preview states, recipient entry, send CTA, disabled-state messaging, countdown rendering, and retry behavior that preserves the loaded preview and recipient input after recoverable failures.
- Keep the page read-only with respect to product data and ensure the send path never triggers `check-price` jobs or new price-record writes.

### Phase 4: Regression Coverage and Operator Validation

- Add automated coverage for preview loading, same-template HTML preview rendering, recipient validation, send success/failure handling, rolling-window disable state, daily-recipient disable state, and preview/send parity.
- Add regression coverage proving the existing manual combined digest action still enqueues the refresh-first worker flow, the scheduled digest completion path still refreshes first, and both remain exempt from the new manual-send safeguards.
- Update quickstart verification steps and note the web runtime env requirements for direct report delivery.

## Story Verification

- **US1 Preview and send the current report on demand**: Automated tests cover preview loading from stored data, rendering the preview from the same shared email template used for sending, empty active-product state, recipient parsing/duplicate validation, direct-send provider failure handling, retry-preserved state, rolling-window quota enforcement, daily-recipient quota enforcement, and the guarantee that no `check-price` jobs or new `priceRecords` writes occur in the report-only flow. Manual checks confirm the preview matches the sent content when no refresh is requested between preview and send.
- **US2 Access the report workflow from the dashboard navigation**: Automated tests cover the presence of the `Send Report to Emails` sidebar item and navigation to the dedicated page. Manual checks verify the route is reachable from the dashboard shell and renders preview, recipients, and send action.
- **US3 Keep existing digest behavior intact**: Automated tests cover the dashboard trigger continuing to call the existing queue-based digest endpoint, the scheduled digest completion path still remaining refresh-first, and the worker using the shared reporting package only after refresh-first child jobs complete. Manual checks verify the `Check All & Send Email` button still behaves the same from the user perspective.

## Technical Constraints

- Preserve the current report email layout, sender identity, and default-recipient behavior for combined and scheduled digest flows.
- Manual report-only sends must never enqueue `send-digest`, `send-digest-scheduled`, or `check-price` jobs.
- Quota counting applies only to completed manual report-only sends and must not affect the existing queue-driven manual or scheduled digest workflows.
- The reviewed preview must remain the source of truth for the direct send, so the send path must reuse a server-generated artifact containing the canonical payload plus rendered subject and HTML rather than rebuild from live database state after the user has reviewed the page.
- The new daily quota logic must use timezone-aware day boundaries and avoid storing recipient-address metadata.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New shared package `packages/reporting` | Both `apps/web` and `apps/worker` must build the same report snapshot and send the same email format | Keeping the logic only in `apps/worker` blocks direct web sends, while duplicating it in `apps/web` would drift and make regressions likely |
