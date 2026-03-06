# Data Model: Global Quick Create Product Dialog

## Overview

This feature does not change persisted database entities. It introduces dashboard-scoped client state and shared UI logic for opening the existing product creation flow.

## Client Entities

### ProductCreateDialogController

- **Purpose**: Own the single source of truth for whether the shared create-product dialog is open inside the dashboard shell.
- **Fields**:
  - `open: boolean` - whether the shared create-product dialog is visible.
  - `source: "sidebar-quick-create" | "products-add-button" | null` - optional trigger origin for analytics, debugging, and idempotent behavior.
- **Rules**:
  - Repeated open requests while `open` is already `true` must not create stacked dialogs.
  - Close requests must reset `source` to `null`.

### ProductCreateFormInput

- **Purpose**: Canonical client input contract shared by every create-product trigger.
- **Fields**:
  - `url: string` - required product URL, validated as a non-empty absolute URL.
  - `name: string` - optional display name entered by the user before submission.
- **Rules**:
  - `url` must use the same Zod validation currently enforced by the Products page flow.
  - `name` must be trimmed and normalized to `null` before submission when empty.

### ProductCreateSubmissionResult

- **Purpose**: Represent the outcome of the shared create-product action in the client flow.
- **Fields**:
  - `success: boolean`
  - `error?: string`
- **Rules**:
  - Success closes the dialog, resets the form, shows the existing success toast, and refreshes route data.
  - Failure keeps the dialog open and shows the existing error toast.

## Relationships

- `NavMain` sidebar trigger calls `ProductCreateDialogController.open("sidebar-quick-create")`.
- `AddProductButton` calls `ProductCreateDialogController.open("products-add-button")`.
- The shared dialog host reads `ProductCreateDialogController.open` and renders the single reusable create-product dialog.
- The reusable create-product dialog consumes `ProductCreateFormInput` and produces `ProductCreateSubmissionResult`.

## State Transitions

1. `closed` -> `open`
   Triggered by sidebar `Quick Create` or Products page `Add Product`.
2. `open` -> `open`
   Triggered by repeated clicks while already open; no duplicate dialog or extra state instance is created.
3. `open` -> `submitting`
   Triggered by valid form submission.
4. `submitting` -> `closed`
   Triggered by successful API response.
5. `submitting` -> `open`
   Triggered by failed API response.
6. `open` -> `closed`
   Triggered by cancel, escape, overlay close, or close button.
