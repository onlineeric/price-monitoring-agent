# Research: Manual Price Report Email

## Decision 1: Introduce a shared `packages/reporting` workspace package

- **Decision**: Move report payload generation, digest email rendering, HTML preview rendering, and email delivery helpers into a new shared package consumed by both `apps/web` and `apps/worker`.
- **Rationale**: The feature requires one report format shared across two runtimes: the worker must keep the existing refresh-first digest flow, while the web app must preview and send the report directly in the request cycle without refreshing prices. A shared package keeps the business logic and React Email template canonical and avoids app-to-app imports.
- **Alternatives considered**:
  - Keep all report logic in `apps/worker` and import from the web app. Rejected because cross-app imports are brittle and invert the monorepo boundary.
  - Duplicate report-building and email code in `apps/web`. Rejected because the spec explicitly requires the same report format and behavior across flows, and duplication would drift.

## Decision 2: Render preview from the same email component and cache it by preview id

- **Decision**: The preview endpoint should generate the report payload once, render the shared `PriceDigest` email template to HTML with `@react-email/render`, cache the reviewed preview artifact in Redis under a short-lived preview id, and return that id along with the rendered subject and HTML. The send endpoint must reuse the cached reviewed artifact instead of rebuilding from live database state.
- **Rationale**: The original idea requires the same email component to power both preview and send. FR-012 also requires the sent report to match the most recently reviewed preview unless the user intentionally regenerates it. Reusing a cached reviewed artifact keeps preview and send aligned even if product data changes between those two actions, and it also allows retry after delivery failure without forcing a rebuild.
- **Alternatives considered**:
  - Rebuild the report from the database at send time. Rejected because the sent content could differ from what the user reviewed.
  - Build a separate app-native preview UI from structured data. Rejected because it can drift from the actual email layout and breaks the "same component for preview and send" goal.
  - Post the entire preview payload back from the client and trust it as the source of truth. Rejected because it relies on client-owned state for canonical server output and complicates tamper resistance.

## Decision 3: Keep refresh-only and send-only workflow boundaries explicit

- **Decision**: Preserve the existing refresh-first digest behavior by making the refresh-only path explicit in the worker and composing it with a shared `sendPriceReportEmail` path, while the new manual report page reuses only the send path.
- **Rationale**: The original refactor idea explicitly separated `updatePrices` from `sendPriceReportEmail`. Making those boundaries explicit keeps the refactor understandable, reduces coupling, and avoids reintroducing price-refresh side effects into the manual report-only workflow.
- **Alternatives considered**:
  - Keep the current flow implicit inside `sendDigest.ts`. Rejected because it hides the architectural intent and makes future regressions more likely.

## Decision 4: Enforce manual-send safeguards with Redis serialization plus a PostgreSQL completion ledger

- **Decision**: Add a `manualReportSends` table for completed manual report-only sends and serialize the check-send-insert sequence with a global Redis lock in the web app.
- **Rationale**: The feature needs app-wide, concurrency-safe limits but only for a low-volume manual workflow. Redis is already available in the web runtime, so a short-lived distributed lock keeps concurrent requests from overshooting limits, while PostgreSQL remains the system of record for rolling-window and daily-recipient counts plus audit/debugging.
- **Alternatives considered**:
  - Check counts without a lock and rely on low traffic. Rejected because the spec explicitly requires atomic enforcement under concurrent requests.
  - Use database advisory locks. Rejected because it would introduce a lower-level SQL locking path when existing Redis infrastructure can solve the coordination problem more cleanly.

## Decision 5: Persist only completed manual sends, with minimal delivery metadata

- **Decision**: Store one row per successful manual report-only send with `completedAt`, `recipientCount`, `previewGeneratedAt`, and an optional provider message id, while storing no recipient addresses.
- **Rationale**: `completedAt` and `recipientCount` are the required minimum for rolling-window and daily-recipient enforcement. `previewGeneratedAt` and provider id improve audit/debugging without violating the requirement to avoid recipient-address persistence.
- **Alternatives considered**:
  - Store recipient addresses. Rejected because the spec forbids recipient-address metadata persistence.
  - Store only timestamp and count. Rejected because it weakens debugging for direct-send failures and makes operator tracing harder when investigating a completed send.

## Decision 6: Use timezone-aware day boundaries via `date-fns-tz`

- **Decision**: Add `date-fns-tz` and centralize a helper that resolves the business timezone from `SCHEDULER_TIMEZONE`, then `TZ`, then `UTC` and computes the current manual-send day window from that zone.
- **Rationale**: The daily 99-recipient cap resets at midnight in the application's configured timezone, which is error-prone if implemented with naive `Date` math. A dedicated timezone helper keeps the logic explicit and consistent with the worker scheduler fallback order.
- **Alternatives considered**:
  - Use native `Date` and string slicing with the server timezone. Rejected because local server timezone may not match the configured business timezone.
  - Add a heavier date-time library. Rejected because `date-fns` is already in use and `date-fns-tz` fits the need with minimal new surface area.
