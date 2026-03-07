# Data Model: Global Product Search Edit Dialog

## Overview

This feature introduces no database schema changes. It adds client-side view models and overlay state around existing product records and the existing product update contract.

## Entities

### Product Search Result

- Purpose: Lightweight client representation rendered in the global search dialog.
- Source: Derived from `GET /api/products`.
- Fields:
  - `id: string`
  - `name: string | null`
  - `url: string`
  - `imageUrl: string | null`
  - `active: boolean`
  - `updatedAt: string | Date | null`
- Derived fields:
  - `displayName: string`
    - Uses product name when present, otherwise a fallback label such as `"Untitled product"` or the existing detecting-title copy chosen by implementation.
  - `hostname: string`
    - Derived from `url` for compact secondary text in the result item.
  - `searchText: string`
    - Normalized concatenation of `name` and `url` for case-insensitive client filtering.
  - `statusGroup: "active" | "inactive"`
    - Used to render active products first and inactive products second.
- Validation rules:
  - `id` and `url` must exist before a result is selectable.
  - `searchText` must include both name and URL content so filtering satisfies `FR-002a`.

### Shared Edit Product Draft

- Purpose: Form-state model used by the shared edit dialog from both Products page actions and global search.
- Source: Initialized from an existing product record.
- Fields:
  - `name: string`
  - `active: boolean`
- Validation rules:
  - `name` must be at least 1 character when submitted.
  - `active` must be a boolean.
- State transitions:
  - `pristine -> dirty`
  - `dirty -> submitting`
  - `submitting -> success`
  - `submitting -> error`
  - `error -> submitting` on retry
  - `dirty|error -> closed` on cancel/dismiss

### Global Search/Edit Flow State

- Purpose: Single controller state that prevents stacked overlays and preserves route context.
- Fields:
  - `mode: "closed" | "search" | "edit"`
  - `selectedProductId: string | null`
  - `requestState: "idle" | "loading" | "ready" | "error"`
  - `query: string`
  - `originPathname: string`
  - `originTrigger: HTMLElement | null`
- Invariants:
  - `mode = "edit"` requires `selectedProductId` to be non-null.
  - Only one overlay mode may be active at a time.
  - Opening while another mode is active is ignored or routed through the existing controller rather than creating a second dialog.
- Transitions:
  - `closed -> search` when the header button or keyboard shortcut opens global search.
  - `search -> edit` after a valid product selection.
  - `search -> closed` on dialog dismiss.
  - `edit -> closed` on save success or cancel/dismiss.
  - `edit -> edit` on save failure, preserving form state and error state.

## Relationships

- One `Global Search/Edit Flow State` controls zero or one visible `Product Search Result` selection at a time.
- One selected `Product Search Result` initializes one `Shared Edit Product Draft`.
- Shared edit modules are reused by:
  - Products page card actions
  - Products page table actions
  - Global search result selection

## Contract Impact

- Read contract reused: `GET /api/products`
- Update contract reused: `PATCH /api/products/[id]`
- No new backend contract is required; the feature depends on client-side normalization and orchestration.
