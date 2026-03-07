# Research: Global Product Search Edit Dialog

## Decision 1: Load product results through the existing `/api/products` endpoint inside a dashboard-scoped provider

- Decision: Use a client-side provider mounted in the dashboard shell to fetch the existing product list from `GET /api/products`, normalize it into a lightweight search-result shape, and pass it to the search dialog.
- Rationale: The current `SearchDialog` is client-only and already owns the open/close interaction. Fetching products in a dashboard-scoped provider keeps the feature available from any dashboard route, avoids new persistence work, and matches the existing pattern used by the product create dialog provider for global overlays.
- Alternatives considered:
  - Fetch inside `SearchDialog` on every open. Rejected because it duplicates orchestration concerns in the presentational dialog and increases repeated request churn.
  - Build a new search-specific API route. Rejected because the existing products endpoint already exposes the required fields and no schema change is needed.
  - Use server-rendered route data per page. Rejected because the feature must work consistently from any dashboard page, not only the Products route.

## Decision 2: Extract edit dialog behavior into shared product-edit modules with caller-controlled completion

- Decision: Split the current `EditProductDialog` into reusable pieces: shared form schema/types, a dialog component that accepts callbacks, and one or more controller wrappers so both Products-page actions and global search can reuse the same validation and submit behavior.
- Rationale: The current dialog couples successful save directly to `router.refresh()`, which is correct for the Products page but incorrect for global search on non-Products routes. A shared module with injected success/close behavior preserves one edit experience while allowing route-aware completion.
- Alternatives considered:
  - Keep separate edit dialog implementations for Products and search. Rejected because it would duplicate validation, toast, request, and error handling.
  - Add conditionals directly into the existing dialog based on pathname/source. Rejected because it would make the component harder to test and less reusable.
  - Navigate to the Products page for editing. Rejected because the spec requires preserving the current page context.

## Decision 3: Model the flow as one overlay state machine in the dashboard shell

- Decision: Represent the feature as a single dashboard-scoped controller with at most one active overlay state: `closed`, `search`, or `edit(selectedProductId)`.
- Rationale: The spec explicitly forbids stacked dialogs and requires the search dialog to close before the edit dialog opens. A simple state machine prevents duplicate opens, makes keyboard/open triggers deterministic, and centralizes focus restoration.
- Alternatives considered:
  - Maintain separate booleans for search and edit dialogs. Rejected because it makes invalid stacked states easier to create.
  - Let search own edit state locally. Rejected because the edit flow must outlive the search dialog and still preserve route-aware refresh rules.

## Decision 4: Preserve responsiveness with in-dialog loading, empty, and recoverable error states

- Decision: Keep the search dialog open immediately, show a loading state while results are being fetched or filtered, show a dedicated empty state when no products exist or no matches remain, and show recoverable errors without route changes.
- Rationale: This aligns with the clarification decisions, keeps the search overlay predictable, and avoids confusing transitions such as closing the dialog before data is ready.
- Alternatives considered:
  - Delay opening until data loads. Rejected because it makes the shortcut feel broken or laggy.
  - Show an empty list while loading. Rejected because it conflates loading with empty-result behavior.

## Decision 5: Verify with provider-level interaction tests plus manual multi-route checks

- Decision: Add Vitest + React Testing Library coverage around the global provider/search/edit orchestration and keep manual validation focused on Products plus non-Products dashboard routes.
- Rationale: The highest-risk logic is client orchestration: loading products, switching overlays, preventing duplicate opens, and refreshing only on `/dashboard/products`. Provider-level tests can cover that without expensive end-to-end setup.
- Alternatives considered:
  - Manual-only verification. Rejected because route-aware refresh and duplicate-open protection are easy to regress.
  - Full browser E2E only. Rejected because the repository already has RTL-based dashboard tests and this feature does not require browser automation to validate core state transitions.
