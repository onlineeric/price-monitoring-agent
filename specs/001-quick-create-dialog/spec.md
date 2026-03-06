# Feature Specification: Global Quick Create Product Dialog

**Feature Branch**: `001-quick-create-dialog`  
**Created**: 2026-03-06  
**Status**: Draft  
**Input**: User description: "current web page left panel there is a Quick Create button, it has no effect. Implement the same function like Products page the "Add Product" button, when click on it, do the same thing which popup a dialog for Add Product. click on Quick Create button should popup the same dialog and do the same thing, no matter we are in whatever page. If necessary, we can auto route to the Products page first and then popup the dialog."

## Clarifications

### Session 2026-03-06

- Q: Should `Quick Create` open the add-product dialog in place from the current route, or route through the Products page first? → A: Open the existing add-product dialog directly on the current page without navigating away.
- Q: What should happen after a successful product creation launched from `Quick Create`? → A: Close the dialog and stay on the current route; refresh only when the current route is the Products page.
- Q: What should happen if `Quick Create` is clicked again while the add-product dialog is already open? → A: Ignore the additional click and keep the current dialog state unchanged.
- Q: How should `Quick Create` behave on pages where the user may have unsaved work? → A: Allow `Quick Create` and leave existing page state untouched behind the dialog.
- Q: On which routes should `Quick Create` be supported? → A: Only on dashboard routes that render the shared sidebar.
- Q: Where should keyboard focus go after the `Quick Create` dialog closes? → A: Restore focus to the `Quick Create` trigger that opened the dialog.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open product creation from anywhere (Priority: P1)

As a dashboard user, I want the left sidebar `Quick Create` button to open the same product creation experience available on the Products page so I can add a product without first navigating to a specific page.

**Why this priority**: The existing primary sidebar action currently has no effect, which blocks a core workflow and creates inconsistent navigation behavior across the dashboard.

**Independent Test**: Can be fully tested by opening any dashboard page, selecting `Quick Create`, and confirming the user can start the same add-product flow without manually going to Products first.

**Acceptance Scenarios**:

1. **Given** a user is on any dashboard page, **When** they select the sidebar `Quick Create` action, **Then** the system opens the add-product dialog with the same fields, labels, and actions as the Products page add flow.
2. **Given** a user is on the Products page, **When** they select the sidebar `Quick Create` action, **Then** the user sees the same add-product dialog they would get from the Products page `Add Product` button.
3. **Given** a user is on a non-Products dashboard page, **When** they select the sidebar `Quick Create` action, **Then** the add-product dialog opens on that current page without automatic navigation to the Products page.

---

### User Story 2 - Complete product creation from the sidebar entry point (Priority: P2)

As a dashboard user, I want the `Quick Create` entry point to behave the same as the Products page add flow after the dialog opens so I can successfully add a product from whichever page I started on.

**Why this priority**: Opening the dialog alone is not enough; the shortcut must preserve the existing add-product outcome to avoid a second, inconsistent creation path.

**Independent Test**: Can be fully tested by launching the dialog from `Quick Create`, submitting valid product details, and confirming the product is added with the same success behavior as the existing add flow.

**Acceptance Scenarios**:

1. **Given** the add-product dialog was opened from `Quick Create`, **When** the user submits valid product details, **Then** the product is created using the same validation, submission, and success handling as the Products page add flow.
2. **Given** the add-product dialog was opened from `Quick Create`, **When** the user submits invalid or incomplete details, **Then** the user sees the same validation and error behavior as the Products page add flow.
3. **Given** the add-product dialog was opened from a non-Products dashboard page, **When** the user submits valid product details, **Then** the dialog closes, the user remains on the same page, and no automatic page refresh occurs.
4. **Given** the add-product dialog was opened from the Products page, **When** the user submits valid product details, **Then** the dialog closes, the user remains on the Products page, and the Products page refreshes to show the new product.

---

### User Story 3 - Preserve context and predictable closing behavior (Priority: P3)

As a dashboard user, I want the `Quick Create` dialog to close cleanly if I cancel or finish the action so the global shortcut feels predictable from any page.

**Why this priority**: A global shortcut must not leave users in a confusing state after canceling or completing the flow.

**Independent Test**: Can be fully tested by opening the dialog from multiple dashboard pages, canceling it, and completing it, then confirming the dialog closes and the user remains in a clear, usable state.

**Acceptance Scenarios**:

1. **Given** the add-product dialog was opened from `Quick Create`, **When** the user cancels or dismisses the dialog, **Then** the dialog closes without triggering product creation.
2. **Given** the add-product dialog was opened from any dashboard route, **When** the dialog is canceled or completed, **Then** the resulting page state remains predictable and the user is not left with a broken or empty experience.
3. **Given** the add-product dialog is already open, **When** the user triggers `Quick Create` again, **Then** the system ignores the repeated trigger and preserves the current dialog content and form state.
4. **Given** a user opens `Quick Create` with keyboard or pointer input, **When** the dialog closes by cancel, submit, or dismiss action, **Then** keyboard focus returns to the same `Quick Create` trigger control.

### Edge Cases

- What happens when a user selects `Quick Create` repeatedly before the dialog finishes opening?
- How does the system behave if `Quick Create` is triggered while the user is already viewing an add-product dialog?
- What happens if a user opens `Quick Create` from a page with unsaved work elsewhere in the interface?
- If `Quick Create` is opened from a page with unsaved work elsewhere in the interface, the system leaves that underlying page state unchanged while the dialog is open and after it closes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST make the sidebar `Quick Create` action interactive on all dashboard pages where the left navigation is shown.
- **FR-001a**: The feature scope is limited to dashboard routes that render the shared left sidebar; non-dashboard routes are out of scope.
- **FR-002**: The system MUST open the same add-product dialog experience that is available from the Products page `Add Product` button when the user selects `Quick Create`.
- **FR-003**: Users MUST be able to launch the add-product flow from `Quick Create` regardless of which dashboard page they are currently viewing.
- **FR-003a**: The system MUST open the add-product dialog on the user's current dashboard route and MUST NOT automatically navigate to the Products page as part of the standard `Quick Create` flow.
- **FR-004**: The `Quick Create` entry point MUST use the same product creation fields, labels, validation rules, submission behavior, and completion behavior as the existing Products page add flow.
- **FR-004a**: After a successful `Quick Create` submission, the dialog MUST close and keep the user on the route where they launched it.
- **FR-004b**: The system MUST refresh route data after a successful `Quick Create` submission only when the dialog was launched from the Products page.
- **FR-006**: The system MUST ensure the user can dismiss the `Quick Create` dialog without creating a product.
- **FR-007**: The system MUST prevent duplicate or stacked dialogs when `Quick Create` is triggered multiple times in quick succession.
- **FR-007a**: If the add-product dialog is already open, subsequent `Quick Create` triggers MUST have no effect on the open dialog instance and MUST preserve any in-progress form input.
- **FR-008**: The system MUST preserve a clear post-action state after canceling or completing the flow so the user is not left in a broken or ambiguous view.
- **FR-008a**: Opening or closing `Quick Create` MUST NOT clear, reset, or otherwise modify unrelated in-progress page state behind the dialog.
- **FR-009**: When the `Quick Create` dialog closes, the system MUST restore keyboard focus to the same `Quick Create` trigger that opened it.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `apps/web`
- **Data and Contracts Impact**: None expected. The feature should reuse the existing product creation contract rather than introducing a new one.
- **Operational Impact**: No new runtime configuration should be required. The feature must remain safe to use from any dashboard route where the global sidebar is rendered.
- **Verification Notes**: Automated coverage should verify the `Quick Create` entry point opens the existing add-product flow from multiple dashboard routes and preserves existing validation and success behavior. Manual validation should confirm the dialog is reachable and usable from at least one non-Products page and from the Products page itself.

### Key Entities *(include if feature involves data)*

- **Quick Create Action**: The persistent sidebar action used as a global entry point for creating a product from anywhere in the dashboard.
- **Add Product Dialog**: The existing product creation interface that collects product details, validates input, and completes product creation.
- **Dashboard User Context**: The current route and page state from which the user triggers `Quick Create`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In manual validation across at least three dashboard pages, selecting `Quick Create` opens the add-product dialog on the first attempt in 100% of tested cases.
- **SC-002**: A user can start product creation from `Quick Create` with no more than one click from any dashboard page where the sidebar is visible.
- **SC-003**: In functional testing, product creation launched from `Quick Create` matches the Products page add flow for valid submission, invalid submission, cancel, and close outcomes in 100% of covered scenarios.
- **SC-004**: The sidebar `Quick Create` action no longer results in a no-op state on supported dashboard pages.

## Assumptions

- The intended behavior is to reuse the existing add-product experience rather than define a separate quick-create form.
- The feature applies to dashboard pages that render the current shared left sidebar.
