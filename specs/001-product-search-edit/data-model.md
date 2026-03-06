# Data Model: Global Product Search Edit Dialog

## Overview

This feature does not change persisted database entities. It introduces dashboard-scoped client state for global product search and reuses the existing product update contract through a shared edit workflow.

## Existing Persisted Entity Reused

### Product

- **Purpose**: Existing database-backed product record displayed in search results and edited through the shared dialog.
- **Fields used by this feature**:
  - `id: string`
  - `name: string | null`
  - `url: string`
  - `imageUrl: string | null`
  - `active: boolean`
  - `updatedAt: Date | null`
- **Rules**:
  - Search matching uses `name` and `url`.
  - Results are grouped active first, inactive second.
  - Product identity remains the existing `id` and URL-backed record in the current schema.

## Client Entities

### GlobalProductSearchController

- **Purpose**: Own the single dashboard-scoped state machine for the search dialog and search-launched edit dialog.
- **Fields**:
  - `searchOpen: boolean` - whether the command/search dialog is visible.
  - `editOpen: boolean` - whether the shared edit dialog is visible.
  - `selectedProductId: string | null` - product selected from search for editing.
  - `originPathname: string | null` - dashboard route where the search flow started.
  - `loadingState: "idle" | "loading" | "ready" | "error"` - product-list fetch status for the search dialog.
- **Rules**:
  - Opening search while `searchOpen` or `editOpen` is already true must not create duplicate stacked flows.
  - Selecting a product transitions the controller from `searchOpen=true` to `editOpen=true`.
  - Closing or canceling edit clears `selectedProductId` and ends the flow.
  - Successful edit refreshes only if `originPathname` is `/dashboard/products`.

### ProductSearchResult

- **Purpose**: Search-dialog projection of an existing product record.
- **Fields**:
  - `id: string`
  - `name: string | null`
  - `url: string`
  - `imageUrl: string | null`
  - `active: boolean`
  - `matchText: string` - derived searchable text from name and URL.
- **Rules**:
  - `matchText` is derived client-side from `name ?? ""` plus `url`.
  - Results must render under either `Active Products` or `Inactive Products`.
  - Empty matches show the command dialog empty state instead of placeholder items.

### SharedEditProductInput

- **Purpose**: Canonical client input contract reused by Products page actions and global search edit.
- **Fields**:
  - `name: string`
  - `active: boolean`
- **Rules**:
  - `name` must satisfy the existing Zod rule of at least one character.
  - `active` remains a boolean toggle.
  - Submission continues to `PATCH /api/products/:id`.

### EditProductFlowResult

- **Purpose**: Represent the outcome of the shared edit-product submission.
- **Fields**:
  - `success: boolean`
  - `error?: string`
- **Rules**:
  - Success closes the dialog, shows the existing success toast, and triggers controller-managed refresh behavior.
  - Failure keeps the dialog open and shows the existing error toast.
  - Not-found or unavailable-product responses must produce a recoverable error state and end in a usable page context.

## Relationships

- `SearchDialog` triggers `GlobalProductSearchController.openSearch()`.
- The controller loads `ProductSearchResult[]` from `GET /api/products`.
- Selecting a `ProductSearchResult` closes search and opens the shared edit dialog for `selectedProductId`.
- Products page card/table actions and global search both render the same shared edit-product workflow.
- The shared edit workflow submits `SharedEditProductInput` to `PATCH /api/products/:id` and reports completion back to the controller or Products-page trigger.

## State Transitions

1. `idle` -> `search-open/loading`
   Triggered by the global search button or keyboard shortcut.
2. `search-open/loading` -> `search-open/ready`
   Triggered by successful product-list load.
3. `search-open/loading` -> `search-open/error`
   Triggered by product-list fetch failure.
4. `search-open/ready` -> `search-open/ready`
   Triggered by typing in the command input; filtered results recalculate without a new request.
5. `search-open/ready` -> `edit-open`
   Triggered by selecting a product result; search closes before edit opens.
6. `edit-open` -> `closed`
   Triggered by cancel, dismiss, or successful save.
7. `edit-open` -> `edit-open`
   Triggered by failed submission; dialog stays open with error feedback.
