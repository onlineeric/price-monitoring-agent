# Feature Specification: Global Product Search Edit Dialog

**Feature Branch**: `001-product-search-edit`  
**Created**: 2026-03-07  
**Status**: Draft  
**Input**: User description: "on top menu there is a Search button/field. Click on it a search dialog will popup. That dialog seems to be default from the dashboard template, it has search feature input text to filter the list below, is we should keep the feature, but the list on the dialog is something hardcoded, we need to in the result area load our products for search. when user choose one product, we should popup the same "Edit Product" dialog which in Products page, click Edit button on one project's options menu. Then the edit product dialog which should be the shared dialog, should function the same to edit the product. it means we need to make the Products page Edit Product dialog a common component, and being called by the search result click. the edit product dialog should behavior similar to the "Quick Create" button, for example, we can popup the search and edit product dialog while the screen on any page, after edit dialog closed, we should return back the the current page, the current page should be refreshed ONLY if current page is the Products page, otherwise don't refresh."

## Clarifications

### Session 2026-03-07

- Q: Which product fields should the global search input match? → A: Match product name and URL.
- Q: How should active and inactive products be organized in search results? → A: Active first, inactive second.
- Q: What should happen to the search dialog when a product is selected for editing? → A: Close search dialog, open edit dialog.
- Q: What should happen after a successful edit launched from global search? → A: Close edit dialog and end flow.
- Q: What should happen when the user cancels the edit launched from global search? → A: Close edit dialog and end flow.
- Q: What should happen if saving changes fails in the edit dialog launched from global search? → A: Keep edit dialog open and allow retry.
- Q: What should the search dialog show while product results are still loading? → A: Show loading state in dialog.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search products from anywhere (Priority: P1)

As a dashboard user, I want the top navigation search dialog to show my real products instead of template placeholder items so I can quickly find a product from any dashboard page.

**Why this priority**: The search entry point already exists in the layout, but it does not currently help users complete a real product task. Replacing hardcoded results with actual products makes the global search useful.

**Independent Test**: Can be fully tested by opening the top navigation search from multiple dashboard pages, typing product terms, and confirming the result list reflects matching saved products rather than static placeholder entries.

**Acceptance Scenarios**:

1. **Given** a user is on any dashboard page with the top navigation search control, **When** they open the search dialog, **Then** the result area shows the application's products instead of hardcoded template items.
2. **Given** the search dialog is open and products exist, **When** the user enters text into the search field, **Then** the result list filters to products whose name or URL matches the entered text.
3. **Given** the search dialog is open and no products match the entered text, **When** the filter is applied, **Then** the dialog shows a clear empty-result state and does not show unrelated placeholder content.
4. **Given** the search dialog is open and matching products exist, **When** the result list is shown, **Then** active products appear in the first section and inactive products appear in the second section.

---

### User Story 2 - Edit a product from search results (Priority: P2)

As a dashboard user, I want to select a product from the global search dialog and open the same edit-product experience used on the Products page so I can update that product without first navigating away.

**Why this priority**: Search only becomes action-oriented if it connects directly to the existing product-management workflow rather than sending the user into a separate or reduced edit path.

**Independent Test**: Can be fully tested by launching the search dialog from a non-Products page, selecting a result, and confirming the same edit-product experience opens with the selected product's details and normal edit behavior.

**Acceptance Scenarios**:

1. **Given** the search dialog shows one or more product results, **When** the user selects a product result, **Then** the search dialog closes and the system opens the same edit-product dialog used by the Products page product actions.
2. **Given** the edit-product dialog was opened from a search result, **When** the user changes product details and saves, **Then** the system applies the same validation, submission, and completion behavior as the existing Products page edit flow.
3. **Given** the edit-product dialog was opened from the search dialog, **When** the user cancels or closes the edit dialog, **Then** no product changes are saved and the user remains on the page where the search started.

---

### User Story 3 - Preserve page context after global edit (Priority: P3)

As a dashboard user, I want the search and edit flow to behave like a global overlay so I can finish or cancel the edit and return to my current page without unnecessary refreshes.

**Why this priority**: A global shortcut must not disrupt the user's current work. The feature is only predictable if it preserves route context and refreshes data only when the current page needs it.

**Independent Test**: Can be fully tested by opening the search and edit flow from both the Products page and another dashboard page, then confirming the close and refresh behavior differs only where required.

**Acceptance Scenarios**:

1. **Given** a user opens the search dialog from a dashboard page other than Products, **When** they complete a successful edit, **Then** the edit-product dialog closes, the flow ends, the user stays on the same page, and the page does not refresh automatically.
2. **Given** a user opens the search dialog from the Products page, **When** they save changes in the edit-product dialog, **Then** the user stays on the Products page and the page refreshes to show the updated product data.
3. **Given** a user opens the search dialog from the Products page, **When** they cancel or dismiss the edit-product dialog, **Then** the edit-product dialog closes, the flow ends, the user stays on the Products page, and no unnecessary refresh occurs.

### Edge Cases

- If the search dialog is opened before product results have finished loading, the dialog remains open and shows a loading state in the results area until the relevant results are ready.
- If the product list is empty when the user opens the search dialog, the dialog shows a dedicated empty state explaining that no products are available yet and does not render template placeholder items.
- If a user selects a product that has been removed or changed before the edit dialog finishes opening, the system shows a recoverable unavailable-product error state, closes any partial edit flow, and returns the user to the same usable page context.
- If saving changes from the edit-product dialog launched from search fails, the dialog remains open, preserves the current form state, shows the standard error feedback, and allows the user to retry.
- If the search trigger is activated while the search dialog or edit-product dialog is already open, the system ignores the repeated trigger and keeps the current overlay state unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST make the existing top navigation search dialog use the application's real product list for its result area instead of hardcoded template entries.
- **FR-002**: The system MUST preserve the search field behavior so users can enter text and narrow the visible product results within the dialog.
- **FR-002a**: The search input MUST match against product name and product URL.
- **FR-003**: Users MUST be able to open the search dialog from any dashboard page where the top navigation search control is available.
- **FR-004**: The system MUST show each matching product in a form that allows the user to select it from the search results.
- **FR-004a**: The result list MUST be organized into two sections, with active products shown first and inactive products shown second.
- **FR-005**: The system MUST provide a clear empty-result state when no products match the current search text.
- **FR-005a**: If product results are still loading when the search dialog opens or the search query updates, the dialog MUST remain open and show a loading state in the results area until the relevant results are ready.
- **FR-006**: When a user selects a product from search results, the system MUST open the same edit-product dialog experience that is currently available from the Products page.
- **FR-006a**: When a user selects a product from search results, the search dialog MUST close before the edit-product dialog opens.
- **FR-007**: The edit-product experience launched from search MUST use the same product fields, validation rules, save behavior, cancel behavior, and error behavior as the Products page edit flow.
- **FR-007a**: If saving changes fails in the edit-product dialog launched from search, the system MUST keep the dialog open, preserve the user's in-progress edits, show the standard save error state, and allow retry.
- **FR-008**: The edit-product dialog MUST be reusable from both the Products page and the global search flow so users receive one consistent edit experience.
- **FR-009**: Launching product edit from the search dialog MUST keep the user on the route where the search started rather than navigating away as part of the standard flow.
- **FR-010**: After the edit-product dialog closes, the system MUST return the user to the same page context from which the search was opened.
- **FR-011**: After a successful edit launched from search, the system MUST refresh page data only when the current page is the Products page.
- **FR-012**: After a successful edit launched from search on any non-Products dashboard page, the system MUST close the dialog flow without automatically refreshing that page.
- **FR-012a**: After a successful edit launched from search, the system MUST NOT reopen the search dialog and MUST end the dialog flow.
- **FR-013**: Canceling or dismissing the edit-product dialog launched from search MUST close the edit-product dialog, end the dialog flow, leave the current page unchanged, and MUST NOT trigger a page refresh.
- **FR-014**: The system MUST prevent duplicate or stacked instances of the search dialog and edit-product dialog when the user repeats the trigger before the current dialog flow closes.
- **FR-015**: If the selected product is unavailable by the time editing begins, the system MUST show a recoverable error state and return the user to a usable page context.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `apps/web`, `specs/`
- **Data and Contracts Impact**: No new product data model is expected. The feature should reuse the existing product-editing contract and load existing product records into the global search results.
- **Operational Impact**: No new runtime configuration is expected. The global search and edit flow must remain safe to use from any supported dashboard route without altering unrelated page state.
- **Verification Notes**: Automated coverage should verify product result loading, search filtering, shared edit-dialog behavior, save and cancel outcomes, and the route-specific refresh rule. Manual validation should confirm the flow from both the Products page and at least one non-Products dashboard page.

### Key Entities *(include if feature involves data)*

- **Global Search Dialog**: The top navigation overlay that accepts search input and presents matching products.
- **Product Search Result**: A selectable representation of an existing saved product within the global search dialog.
- **Shared Edit Product Dialog**: The common product-editing experience available from both the Products page and the global search flow.
- **Page Context**: The current dashboard route and visible state that must be preserved while the dialog flow is active.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In manual validation on the Products page and at least two other dashboard pages, opening the top navigation search shows real product results instead of template placeholder entries in 100% of tested cases.
- **SC-002**: In functional testing, users can narrow search results to the intended product using the search field and receive a correct empty-result state when nothing matches in 100% of covered cases.
- **SC-003**: In functional testing, selecting a product from global search opens the same edit-product experience and produces the same save, validation, cancel, and failure outcomes as editing from the Products page in 100% of covered scenarios.
- **SC-004**: After edits launched from global search, the Products page refreshes only when it is the current page, and non-Products pages do not refresh automatically in 100% of covered scenarios.

## Assumptions

- The feature scope is limited to dashboard pages that already include the top navigation search control.
- The existing search dialog layout and text-input interaction remain in place; the required change is to replace hardcoded results with real product data and connect result selection to editing.
- The current Products page edit-product behavior is the source of truth for all edit rules and outcomes.
