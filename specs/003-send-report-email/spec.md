# Feature Specification: Manual Price Report Email

**Feature Branch**: `003-send-report-email`  
**Created**: 2026-03-17  
**Status**: Draft  
**Input**: User description: "Create a new dashboard page named 'Send Report to Emails' that lets users preview the current price report, enter one or more email addresses separated by commas, and send the report without updating product prices first. Refactor the existing digest flow so report sending is decoupled from price updates while keeping the existing check-all-and-send behavior unchanged."

## Clarifications

### Session 2026-03-17

- Q: How should the generated spec treat scope that was not explicit in the original idea note but was approved during clarification? → A: Preserve the original page + preview + report-only-send workflow as the core feature, and treat the recipient privacy rules, manual-send safeguards, and minimal audit/limit ledger as approved scope additions that refine the idea for safe operation.
- Q: How should recipient visibility work when sending to one or more manual recipients? → A: Send a single-recipient report using `To`; if multiple recipients are entered, send one email with all recipients hidden in `BCC`.
- Q: What is the maximum number of manual recipients allowed per send? → A: Maximum 3 recipients per send.
- Q: How should duplicate recipient email addresses be handled? → A: Block send and require the user to remove duplicate addresses.
- Q: Which products should the manual report preview and send include? → A: Include only active products.
- Q: When is there enough data to allow a report-only send? → A: Allow send when at least one active product exists, even if some rows show missing price data.
- Q: Should the 3-sends-per-10-minutes and 99-receiver-per-day safeguards apply globally across the app or per user/session? → A: Apply both limits globally across all manual report sends in the app.
- Q: Which workflows should the 3-sends-per-10-minutes and 99-receiver-per-day safeguards apply to? → A: Apply both safeguards only to the new manual report-only page.
- Q: When should the 99-recipient daily limit reset? → A: Reset at midnight in the app's configured timezone using `SCHEDULER_TIMEZONE`, then `TZ`, then `UTC`.
- Q: Should successful manual report-only sends be persisted for limit enforcement and auditability? → A: Persist one record per completed manual report-only send with timestamp, recipient count, and enough metadata to enforce limits and support audit/debugging.
- Q: Should report-only sending happen directly in the web request or via a background job? → A: Send report-only emails directly in the web request so delivery failures can be shown to the user immediately on the page.
- Q: What recipient data should be stored on persisted manual report-only send records? → A: Persist only recipient count, with no recipient-address metadata.
- Q: How strict must safeguard enforcement be under concurrent manual report-only send requests? → A: Enforce the limits atomically so concurrent requests cannot exceed the 3-per-10-minute or 99-per-day caps.
- Q: Should the existing combined and scheduled digest flows keep their current default-recipient behavior? → A: Yes, keep the existing recipient behavior unchanged for the combined and scheduled digest flows.
- Q: How should the digest/report implementation be refactored? → A: Refactor the current workflow into reusable functions that separate price refresh from report sending, then compose the existing workflow from those functions.
- Q: Should the dashboard preview render the same email template that will be sent, or a separate app-specific layout? → A: Render the same shared email template and reviewed payload used for sending so preview and sent output stay aligned.

### Scope Evolution from Original Idea

The original idea focused on three core outcomes: a new dashboard page, a report preview built from already stored product data, and a report-only send path decoupled from price refresh while preserving the existing refresh-first digest flow. During clarification, this scope was intentionally expanded to include recipient privacy behavior, manual-send abuse safeguards, atomic concurrency enforcement, and a minimal completed-send ledger so the report-only workflow remains operationally safe without changing the existing combined or scheduled digest behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview and send the current report on demand (Priority: P1)

As a dashboard user, I want to preview the current price report and send it to one or more email recipients without refreshing product prices so I can manually share the latest stored report whenever needed.

**Why this priority**: The core value of the feature is a new report-only path. Without this workflow, users must trigger a full price refresh every time they want to send a report, even when they only need to resend the latest stored information.

**Independent Test**: Can be fully tested by opening the report page, confirming the preview reflects currently stored product information, entering one or more valid email addresses, and sending the report while verifying that no product prices are refreshed as part of that action.

**Acceptance Scenarios**:

1. **Given** a user opens the report-sending page and stored report data is available, **When** the page loads, **Then** the system shows a preview of the report content built from the current product information already stored in the system.
2. **Given** a user is reviewing the report-sending page, **When** they enter one or more valid email addresses separated by commas and choose send, **Then** the system sends the report to all specified recipients without triggering a product price refresh.
3. **Given** a user submits a valid report-only send and the email provider rejects or fails the send during that request, **When** the page receives the response, **Then** the system keeps the user on the page and shows the delivery error directly without falsely reporting success.
4. **Given** a user has generated a preview and has not refreshed it again, **When** they send the report, **Then** the sent content matches the report version they most recently reviewed on the page.
5. **Given** the application has already completed 3 sends from the manual report-only page within the last 10 minutes, **When** a user views or returns to that page, **Then** the send action is disabled and the page shows how long remains until sending is allowed again.
6. **Given** the application has already sent 99 receiver addresses through the manual report-only page during the current day, **When** a user views or returns to that page, **Then** the send action is disabled and the page shows that the 99-email daily send limit has been reached.

---

### User Story 2 - Access the report workflow from the dashboard navigation (Priority: P2)

As a dashboard user, I want a dedicated left-navigation entry for sending reports so I can find the workflow quickly without relying on the existing combined digest trigger.

**Why this priority**: The feature needs a clear, discoverable entry point. If users cannot reliably reach the new workflow from the dashboard navigation, the report-only capability remains hidden.

**Independent Test**: Can be fully tested by navigating through the dashboard sidebar, selecting the new menu item, and confirming it opens the dedicated report-sending page with the expected preview, recipient input, and send action.

**Acceptance Scenarios**:

1. **Given** a user is viewing the dashboard navigation, **When** they look at the left menu, **Then** they can see a menu item labeled `Send Report to Emails`.
2. **Given** a user selects `Send Report to Emails`, **When** the page opens, **Then** the system shows the report preview area, recipient entry area, and send action on that page.

---

### User Story 3 - Keep existing digest behavior intact (Priority: P3)

As a product owner, I want the existing manual and scheduled digest workflow to keep updating prices before sending the report so the new report-only option does not break established operations.

**Why this priority**: This feature includes refactoring of a working process. Preserving current combined behavior is essential so the team gains the new option without regressing the existing scheduled or one-click flow.

**Independent Test**: Can be fully tested by exercising the existing combined digest trigger and the scheduled digest process after the refactor, confirming both still refresh prices first and then send the report successfully.

**Acceptance Scenarios**:

1. **Given** a user triggers the existing combined digest action, **When** the workflow runs, **Then** the system still refreshes product prices before sending the report email.
2. **Given** the scheduled digest workflow runs, **When** it completes, **Then** the system still refreshes product prices before sending the report email.
3. **Given** the new report-only workflow is available, **When** users choose the existing combined digest action instead, **Then** its behavior remains unchanged from the current user perspective.

### Edge Cases

- If the user enters a comma-separated recipient list that includes invalid or duplicate email addresses, the system identifies the problematic entries before send and explains what must be corrected.
- If the user enters more than 3 email addresses, the system prevents sending and explains the recipient limit.
- If the application has already completed 3 sends from the manual report-only page within the last 10 minutes, the page disables the send action and shows a countdown until the next allowed send time.
- If a new send from the manual report-only page would cause the application's daily manual receiver total to exceed 99 for the current day, the page prevents that send, disables the send action for that state, and explains that the daily receiver limit would be exceeded.
- If the application's daily manual receiver total for sends from the manual report-only page has already reached 99 for the current day, the page disables the send action and shows that the 99-email daily send limit has been reached.
- If two or more valid report-only send requests arrive at nearly the same time, the system still enforces the rolling and daily safeguards atomically so the configured limits are not exceeded.
- If no active products are currently available, the page shows an informative empty preview state and prevents sending a misleading or blank report.
- If at least one active product exists but some products have missing current price data or recent failures, the preview still includes those rows using the standard report format and the user may still send the report.
- If preview generation fails, the page keeps the user in place, shows a recoverable error state, and does not allow sending until a valid preview is available.
- If sending fails after the user has reviewed the preview, the system keeps the reviewed report state and recipient input available so the user can retry without rebuilding the page from scratch.
- If the email provider rejects or fails a report-only send during the web request, the page shows that delivery error directly in the same interaction and does not report the send as successful.
- If underlying product data changes after a preview was generated but before the user refreshes the preview, the system preserves the last reviewed report version for sending until the user intentionally regenerates or reloads the preview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add a new left-navigation menu item labeled `Send Report to Emails`.
- **FR-002**: The system MUST provide a dedicated dashboard page for the `Send Report to Emails` workflow.
- **FR-003**: The report-sending page MUST display a preview of the report content using the product information currently stored in the system.
- **FR-003a**: The preview shown on the report-sending page MUST be rendered from the same canonical report payload and shared email template used for report delivery.
- **FR-003b**: The system MUST preserve the reviewed preview as a server-generated artifact that includes the rendered report subject and HTML used for later sending.
- **FR-004**: The preview shown on the report-sending page MUST be generated without triggering product price checks or writing new price records.
- **FR-005**: The report-sending page MUST allow users to enter one to three recipient email addresses in a comma-separated format.
- **FR-006**: The system MUST validate the recipient list before send and identify any invalid email addresses or recipient-limit violations that must be corrected.
- **FR-006a**: The system MUST block sending when the recipient list contains duplicate email addresses and require the user to remove the duplicates before retrying.
- **FR-007**: The system MUST allow users to send the report to all valid recipients entered on the page, using `To` when exactly one recipient is provided and `BCC` when multiple recipients are provided.
- **FR-007a**: The manual report page MUST enforce a global limit of at most 3 completed send actions from the manual report-only workflow across the application within any 10-minute period.
- **FR-007b**: When the 3-sends-in-10-minutes limit is active, the system MUST disable the send action and show a countdown indicating when manual sending becomes available again.
- **FR-007c**: The manual report page MUST enforce a global limit of 99 total receiver deliveries per day across all sends from the manual report-only workflow in the application.
- **FR-007d**: The daily receiver-delivery count MUST be calculated per recipient address, so one send to 3 recipients counts as 3 toward the daily limit.
- **FR-007e**: The system MUST prevent any send that would cause the current day's receiver-delivery total to exceed 99.
- **FR-007f**: When the daily receiver-delivery limit has been reached, or when the current recipient list would exceed the remaining daily allowance, the system MUST disable the send action and show a clear message that the 99-email daily send limit has been reached.
- **FR-007g**: The current day for the daily receiver-delivery limit MUST reset at midnight in the application's configured timezone, using `SCHEDULER_TIMEZONE`, then `TZ`, then `UTC`.
- **FR-007h**: The system MUST persist one record for each completed send from the manual report-only workflow, including the completion timestamp and recipient count, with no recipient-address metadata stored.
- **FR-007i**: The system MUST enforce the manual report-only safeguards atomically so concurrent requests cannot complete in a way that exceeds the 3-sends-per-10-minutes or 99-receiver-per-day limits.
- **FR-008**: The system MUST use the same report content structure, sender identity, and overall report format for both the existing digest flow and the new report-only flow.
- **FR-008a**: The manual report preview and report-only send flow MUST include only products that are currently active, matching the existing digest scope.
- **FR-009**: The new report-only flow MUST send the report without starting any product price refresh activity.
- **FR-009a**: The report-only workflow MUST attempt email delivery directly within the web request/response cycle rather than delegating the send to a background job.
- **FR-010**: The system MUST keep the existing combined digest flow available so users can still choose the workflow that refreshes prices and then sends the report.
- **FR-010a**: The existing manual combined digest action MUST NOT consume or be blocked by the safeguards that apply to the manual report-only workflow.
- **FR-010b**: The existing manual combined digest action MUST keep its current configured default-recipient behavior unchanged.
- **FR-011**: The existing scheduled digest workflow MUST continue to refresh prices before sending the report.
- **FR-011a**: The existing scheduled digest workflow MUST NOT consume or be blocked by the safeguards that apply to the manual report-only workflow.
- **FR-011b**: The existing scheduled digest workflow MUST keep its current configured default-recipient behavior unchanged.
- **FR-012**: The preview and send experience MUST reflect the same reviewed report version unless the user intentionally refreshes or regenerates the preview.
- **FR-013**: If no active products are available to include in the report, the system MUST show a clear empty preview state and MUST NOT allow the user to send the report.
- **FR-013a**: If at least one active product is available, the system MUST allow report preview and sending even when some included products have missing current price data, preserving the standard report representation for those rows.
- **FR-014**: If preview generation or sending fails, the system MUST show a recoverable error state that allows the user to retry from the same page.
- **FR-014a**: If the email provider rejects or fails a report-only send during the direct web request, the system MUST return that delivery failure to the page immediately and MUST NOT present the send as successful.
- **FR-015**: The new report-sending page MUST be read-only with respect to product data and MUST NOT modify product details, product status, or historical price records.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `apps/web`, shared server-safe report/email modules or package, `apps/worker` for preserved existing digest behavior, `packages/db`, `specs/`
- **Data and Contracts Impact**: A persistence change is expected so completed sends from the manual report-only workflow can be stored for safeguard enforcement and basic audit/debugging without storing recipient-address metadata. The feature still requires a new report-only preview/send surface while preserving the current combined digest trigger and scheduled report behavior.
- **Refactoring Constraint**: The implementation MUST expose two reusable workflow boundaries: a price-refresh path that updates stored prices without sending email, and a report-send path that reads stored data and sends the report without refreshing prices. The existing combined digest workflow MUST compose those boundaries, while the new manual report-only workflow MUST reuse only the report-send path. The reviewed preview artifact for the manual report-only workflow MUST be rendered from the same shared email template used by the report-send path.
- **Operational Impact**: Existing email configuration and scheduling behavior must remain valid. The new manual report-only flow must be safe to use repeatedly without causing unintended price refreshes or duplicate product updates, and it must enforce manual-send safeguards that cap usage at 3 sends per 10 minutes and 99 receiver deliveries per day without affecting the existing combined or scheduled digest flows. Daily receiver-limit calculations must align with the application's configured operational timezone. Direct report-only sends must surface provider failures immediately to the requesting page. Safeguard enforcement must remain correct under concurrent requests.
- **Verification Notes**: Automated coverage should verify navigation access, preview rendering from the same shared email template used for sending, recipient validation, report-only sending, temporary send-rate enforcement, daily receiver-limit enforcement, and preservation of both the existing combined and scheduled digest flows. Manual validation should confirm that the dedicated page shows the current stored report, disables sending with the correct limit messaging when safeguards apply, and that the existing combined digest still refreshes prices before sending.

### Key Entities *(include if feature involves data)*

- **Manual Report Page**: The dashboard page where users preview the current report, enter recipients, and send it on demand.
- **Report Preview**: The user-visible rendered email representation of the current report content built from the latest product information already stored in the system.
- **Reviewed Report Artifact**: The server-generated preview version that stores the reviewed preview id, subject, rendered HTML, generated timestamp, and canonical report payload so the send action can deliver exactly what was reviewed.
- **Recipient List**: The set of one or more email addresses entered by the user for a single manual send action.
- **Manual Send Window**: The rolling application-wide 10-minute allowance that permits at most 3 completed sends from the manual report-only workflow before that page temporarily disables sending.
- **Daily Receiver Delivery Count**: The application-wide current-day total of recipient addresses included across sends from the manual report-only workflow, where each recipient address counts individually toward the 99-address daily maximum.
- **Manual Report Send Record**: A persisted record of one completed send from the manual report-only workflow, including when it completed and how many recipients were included, without storing recipient-address metadata.
- **Combined Digest Workflow**: The existing operational flow that refreshes product prices and then sends the report.
- **Report-Only Workflow**: The new operational flow that sends the report using already stored product information without refreshing prices first.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, users can reach the `Send Report to Emails` page from the left navigation and view a report preview in 100% of covered cases.
- **SC-002**: In functional testing, users can send a manually triggered report to one or more valid comma-separated email recipients in 100% of covered valid-input scenarios.
- **SC-002a**: In covered delivery-failure tests, report-only sends that fail during the direct web request surface an immediate error on the page in 100% of covered failure scenarios.
- **SC-003**: In verification of the report-only flow, no product price refresh activity or new price history entries are created in 100% of covered manual-send scenarios.
- **SC-004**: In regression testing, the existing combined digest workflow still refreshes prices before sending the report in 100% of covered manual and scheduled scenarios.
- **SC-005**: In covered comparison tests, the content sent from the report-only page matches the user-reviewed preview whenever the preview was not intentionally regenerated before send.
- **SC-006**: In covered edge-case tests, the report-only flow remains sendable when at least one active product exists, even if some included products render with missing price data or failed-check indicators.
- **SC-007**: In covered rate-limit tests, users cannot complete more than 3 sends from the manual report-only workflow within any 10-minute period, and that page shows the disabled state with a countdown in 100% of over-limit cases.
- **SC-008**: In covered quota-limit tests, the system prevents sends from the manual report-only workflow that would push the current day's receiver-delivery total above 99 and shows the disabled-state limit message in 100% of over-limit cases.
- **SC-009**: In covered concurrency tests, overlapping valid report-only send requests do not allow the application to exceed either safeguard limit in 100% of covered cases.

## Assumptions

- The new page is available within the existing authenticated dashboard experience and follows the same access rules as other dashboard pages.
- Recipient addresses entered for a manual send are used for that send action and are not automatically saved as long-term settings unless explicitly added in a future feature.
- Only completed sends from the manual report-only workflow count toward the 3-sends-per-10-minutes safeguard and the 99-receiver daily safeguard; blocked attempts do not consume allowance.
- The 3-sends-per-10-minutes safeguard and the 99-receiver daily safeguard are application-wide operational limits for the manual report-only workflow, not per-user or per-browser limits.
- The report preview uses the same business content currently considered the system's standard price report rather than introducing a different report layout or data set.
- A product with missing current price data remains reportable if it is active, because the standard digest format already supports rows with unavailable values.
- The daily receiver-delivery total resets at midnight in the application's configured timezone, using `SCHEDULER_TIMEZONE`, then `TZ`, then `UTC`.
