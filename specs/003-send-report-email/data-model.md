# Data Model: Manual Price Report Email

## Overview

This feature adds one persisted ledger entity for completed manual report-only sends and several runtime entities that coordinate preview generation, recipient validation, and quota enforcement.

## Persisted Entities

### ManualReportSendRecord

- **Purpose**: Record each completed manual report-only send so the system can enforce rolling and daily quotas and retain minimal audit/debug context.
- **Fields**:
  - `id: uuid` - primary key.
  - `recipientCount: number` - required integer count of recipients included in the completed send.
  - `previewGeneratedAt: Date` - timestamp of the reviewed preview snapshot that was delivered.
  - `providerMessageId: string | null` - optional delivery provider identifier returned by Resend.
  - `completedAt: Date` - completion timestamp used for quota calculations.
- **Rules**:
  - A row is inserted only after the provider accepts the manual report-only send.
  - No recipient-address metadata is stored.
  - `recipientCount` must be between 1 and 3 inclusive.
  - Rolling-window limits are computed from rows where `completedAt >= now - 10 minutes`.
  - Daily limits are computed by summing `recipientCount` for rows whose `completedAt` falls within the current business day window.

## Runtime Entities

### ManualReportPreviewSnapshot

- **Purpose**: Represent the exact reviewed report version that the page displays and the send endpoint later delivers.
- **Fields**:
  - `previewId: string` - opaque Redis-backed identifier for the cached snapshot.
  - `generatedAt: Date` - when the snapshot was built.
  - `subject: string` - rendered email subject for the reviewed preview.
  - `html: string` - rendered HTML generated from the shared digest email template.
  - `productCount: number` - number of active products included in the report.
  - `items: ReportSnapshotItem[]` - canonical report rows used for both preview and email delivery.
- **Rules**:
  - The snapshot is generated from current stored data only and never triggers price refresh jobs.
  - `html` is rendered from the same shared email template that the send flow uses.
  - If `productCount === 0`, the page renders an empty preview state and sending is disabled.
  - The send endpoint must reuse the cached snapshot referenced by `previewId`.

### ReportSnapshotItem

- **Purpose**: Canonical report row shape shared by preview rendering and email delivery.
- **Fields**:
  - `productId: string`
  - `name: string`
  - `url: string`
  - `imageUrl: string | null`
  - `currentPrice: number | null`
  - `currency: string | null`
  - `lastChecked: Date | null`
  - `lastFailed: Date | null`
  - `vsLastCheck: number | null`
  - `vs7dAvg: number | null`
  - `vs30dAvg: number | null`
  - `vs90dAvg: number | null`
  - `vs180dAvg: number | null`
- **Rules**:
  - Only active products appear in this collection.
  - Items may contain `null` price or comparison fields when a product has missing data; those rows remain sendable.

### ManualReportRecipientInput

- **Purpose**: Canonical input contract for the page's comma-separated recipient field.
- **Fields**:
  - `rawInput: string` - user-entered comma-separated value.
  - `recipients: string[]` - trimmed parsed recipients.
  - `errors: string[]` - validation messages shown before send.
- **Rules**:
  - `recipients.length` must be between 1 and 3 inclusive.
  - Every recipient must be a valid email address.
  - Duplicate addresses are rejected before send.

### ManualReportSendAvailability

- **Purpose**: Describe whether the current page state may send now and why not when blocked.
- **Fields**:
  - `canSend: boolean`
  - `rollingWindowUsed: number`
  - `rollingWindowLimit: number`
  - `dailyRecipientsUsed: number`
  - `dailyRecipientsLimit: number`
  - `blockedUntil: Date | null`
  - `reason: "none" | "no-active-products" | "rolling-window-limit" | "daily-recipient-limit" | "preview-unavailable"`
- **Rules**:
  - `blockedUntil` is populated only when the rolling 10-minute limit is active.
  - The daily-limit reason also covers the case where the selected recipient list would exceed the remaining daily allowance.

### ManualReportSendRequest

- **Purpose**: The server-side command that turns a reviewed preview into a direct email send.
- **Fields**:
  - `previewId: string`
  - `recipients: string[]`
- **Rules**:
  - The preview id must resolve to a valid cached snapshot.
  - The request is evaluated under a global lock before send.
  - On provider failure, no `ManualReportSendRecord` is written.

## Relationships

- `ManualReportPreviewSnapshot.items` is built from active products and their latest price/trend data.
- `ManualReportPreviewSnapshot.subject` and `ManualReportPreviewSnapshot.html` are rendered from the shared digest email template using that canonical payload.
- `ManualReportSendRequest.previewId` references one `ManualReportPreviewSnapshot`.
- A successful `ManualReportSendRequest` creates one `ManualReportSendRecord`.
- `ManualReportSendAvailability` is derived from `ManualReportSendRecord` rows plus the current preview state and current recipient selection.

## State Transitions

1. `idle` -> `preview-loading`
   Triggered when the page opens or the user regenerates the preview.
2. `preview-loading` -> `preview-ready`
   Triggered when a valid `ManualReportPreviewSnapshot` and `ManualReportSendAvailability` are loaded.
3. `preview-loading` -> `preview-error`
   Triggered when snapshot generation fails.
4. `preview-ready` -> `sending`
   Triggered when the user submits a valid `ManualReportSendRequest`.
5. `sending` -> `preview-ready`
   Triggered by provider failure or recoverable validation/limit failure; preview and input remain available for retry.
6. `sending` -> `send-success`
   Triggered when the provider accepts the send and a `ManualReportSendRecord` is persisted.
7. `preview-ready` -> `preview-ready`
   Triggered by recipient edits; `ManualReportSendAvailability` recomputes remaining daily allowance messaging without regenerating the preview.
