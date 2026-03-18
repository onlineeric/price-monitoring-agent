# Contract: Manual Report Preview and Send

## Scope

This contract defines the dashboard navigation entry, preview-loading behavior, and direct-send request/response rules for the new `Send Report to Emails` workflow.

## Navigation Contract

- The dashboard sidebar must expose a new item labeled `Send Report to Emails`.
- Selecting that item must navigate to a dedicated dashboard page for previewing and sending the current report.
- The page must be read-only with respect to product data and must not expose product-editing actions.

## Preview Contract

- `GET /api/manual-report/preview` must load the current reviewed preview from stored data only for the `Send Report to Emails` page.
- The page must load the current report preview from stored data only, without triggering `check-price` jobs or writing new `priceRecords`.
- Preview data must include only active products.
- The page must display preview HTML rendered from the same shared email template that the send flow uses.
- If there are no active products, the page must render an empty preview state and disable sending.
- On success, the preview response must return HTTP `200` and include:

```json
{
  "preview": {
    "previewId": "preview_123",
    "generatedAt": "2026-03-17T08:00:00.000Z",
    "subject": "Price Digest - March 17, 2026",
    "html": "<!doctype html><html><body>...</body></html>",
    "productCount": 2,
    "items": [
      {
        "productId": "uuid",
        "name": "Example Product",
        "url": "https://example.com/product",
        "currentPrice": 12999,
        "currency": "USD"
      }
    ]
  },
  "availability": {
    "canSend": true,
    "rollingWindowUsed": 1,
    "rollingWindowLimit": 3,
    "dailyRecipientsUsed": 4,
    "dailyRecipientsLimit": 99,
    "blockedUntil": null,
    "reason": "none"
  }
}
```

- When there are no active products, the preview response must still return HTTP `200` with a valid `preview.previewId`, `preview.productCount` set to `0`, an empty rendered-preview state, and `availability.reason` set to `no-active-products` so the page can render the empty state without treating it as a transport failure.
- If preview generation fails before a valid reviewed preview can be created, `GET /api/manual-report/preview` must return a recoverable error response with HTTP `500` and a client-actionable payload shaped as:

```json
{
  "error": {
    "code": "preview_generation_failed",
    "message": "Unable to generate the current report preview."
  }
}
```

- The send flow must use the returned `previewId` so the email content matches the reviewed preview unless the page explicitly regenerates preview data.

## Recipient Validation Contract

- The page must accept one comma-separated input field that resolves to 1-3 recipients.
- Every recipient must be a valid email address.
- Duplicate addresses must block sending.
- Exactly one valid recipient sends with `To`; two or three valid recipients send as one email with all recipients in `BCC`.

## Send Contract

- `POST /api/manual-report/send` must accept:

```json
{
  "previewId": "preview_123",
  "recipients": ["one@example.com", "two@example.com"]
}
```

- The send handler must:
  - validate the recipients again on the server
  - reacquire the reviewed preview artifact by `previewId`
  - re-check the global manual-send safeguards atomically
  - send immediately in the request/response cycle
  - persist one completed-send record only after provider success
- The send handler must not enqueue the existing digest worker flow and must not refresh product prices.

## Response Contract

- Success response:

```json
{
  "success": true,
  "recipientCount": 2,
  "generatedAt": "2026-03-17T08:00:00.000Z"
}
```

- Validation failure response must use a client-actionable error payload and keep the user on the page.
- Limit failure response must explain whether the block is from the rolling-window rule or the daily-recipient rule and include the updated disabled-state data needed by the page.
- Provider failure response must surface the delivery error immediately and must not report success.

## Verification Contract

- Automated coverage must prove the report-only flow never calls the refresh-first digest queue path.
- Automated coverage must prove the preview HTML is rendered from the same shared email template used for send.
- Automated coverage must prove preview/send parity by sending a reviewed `previewId`.
- Automated coverage must prove duplicate or over-limit recipients are rejected before a completed send is recorded.
- Automated or worker-level regression coverage must prove the scheduled digest path still refreshes first before sending.
- Manual verification must confirm the sidebar route is reachable, the page disables correctly at both quota limits, and the legacy `Check All & Send Email` action remains unchanged.
