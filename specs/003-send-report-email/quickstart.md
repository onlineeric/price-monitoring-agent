# Quickstart: Manual Price Report Email

## Goal

Validate the new dashboard page that previews the current stored report and sends it directly to one to three recipients without refreshing prices, while confirming the existing combined digest flow still refreshes first.

## Prerequisites

- Install dependencies with `pnpm install`
- Start PostgreSQL and Redis with `pnpm docker:up`
- Configure `.env` with at least `DATABASE_URL`, `REDIS_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `ALERT_EMAIL` if you want to manually verify the legacy combined digest delivery path
- Start the web app with `pnpm --filter @price-monitor/web dev`
- Start the worker with `pnpm dev:worker` if you want to manually verify the existing combined digest regression flow

## Implementation Notes

- Add one shared `packages/reporting` package so the worker and web app reuse the same payload-building, email-template rendering, and email-delivery logic.
- Keep the new manual-report safeguards in the web runtime by combining a Redis lock with PostgreSQL completed-send records.
- Render the reviewed preview from the shared digest email component, cache that reviewed preview artifact in Redis, and send by `previewId` so the direct-send path reuses the exact reviewed report version.
- Use timezone-aware day-boundary helpers for the 99-recipient daily cap.
- Preserve the existing `POST /api/digest/trigger` queue behavior for the `Check All & Send Email` button.

## Verification

1. Run `pnpm lint`.
2. Run `pnpm --filter @price-monitor/web test`.
3. Open `/dashboard/send-report` and verify the page shows the current report preview using only active products and that the preview is the rendered email content from the shared digest template.
4. Verify that products with missing current price data still appear in the preview, while zero active products shows an empty state with sending disabled.
5. Enter invalid, duplicate, and more-than-3 recipient lists and verify the page blocks sending with corrective messages.
6. Send to one valid recipient and verify success returns immediately on the page without triggering any price-refresh activity.
7. Send to multiple valid recipients and verify the workflow still sends one email while hiding recipients from each other via `BCC`.
8. Trigger provider-failure or simulated API failure and verify the page keeps the reviewed preview and recipient input so the user can retry.
9. Seed or simulate enough successful manual sends to verify:
   - the 3-sends-per-10-minutes rule disables the button and shows a countdown
   - the 99-recipient daily rule disables the button and blocks requests that would exceed the remaining allowance
10. Use the dashboard `Check All & Send Email` button and verify it still enqueues the refresh-first digest workflow instead of using the new direct-send path.
11. Trigger or simulate the scheduled digest completion path and verify it still refreshes active products before sending with the legacy default-recipient behavior.
