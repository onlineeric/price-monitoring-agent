# Research: Global Product Search Edit Dialog

## Decision 1: Host the search-to-edit flow in a dashboard-scoped provider alongside the existing quick-create provider

- **Decision**: Add a dedicated dashboard-scoped client controller/provider that owns the global search dialog state, selected product state, and edit-dialog state, then mount its dialog host in the shared dashboard shell.
- **Rationale**: The current `SearchDialog` already lives in `dashboard-client-shell.tsx`, and the existing `ProductCreateDialogProvider` proves the dashboard shell is the right place for route-preserving global overlays. A provider keeps the flow available from any dashboard route without routing through `/dashboard/products`.
- **Alternatives considered**:
  - Keep state local to `search-dialog.tsx` and instantiate the edit dialog there. Rejected because Products-page edit reuse would still remain fragmented, and state coordination between search and edit would become harder to test.
  - Use query params or route navigation to open edit. Rejected because the feature explicitly needs overlay-style behavior that preserves the current page context.

## Decision 2: Extract the current Products-page edit behavior into one shared edit-product workflow

- **Decision**: Refactor `EditProductDialog` into reusable edit-product modules with explicit callbacks for success, cancel, and open-state changes so both the Products page and the global search flow use the same validation, fetch, toast, and error handling.
- **Rationale**: Today the card and table views each open the same dialog component, but the dialog itself is still coupled to unconditional `router.refresh()`. Sharing the edit workflow through a route-aware controller removes duplicated orchestration and aligns with the spec requirement that the Products page edit dialog become the common component.
- **Alternatives considered**:
  - Leave `EditProductDialog` mostly unchanged and special-case search behavior with extra props only in the search flow. Rejected because refresh and close behavior would remain route-coupled inside the dialog.
  - Duplicate the edit form for search results. Rejected because it would immediately violate the consistency requirement and increase regression risk.

## Decision 3: Load real products through the existing `/api/products` contract and filter client-side by name and URL

- **Decision**: Reuse `GET /api/products` to load products into the global search dialog and filter them client-side against `name` and `url`, then render grouped active and inactive sections.
- **Rationale**: The repository already exposes a typed product list endpoint and the expected result size for a dashboard command palette is modest. Client-side filtering keeps the command dialog responsive, avoids new API surface area, and stays within the current no-schema-change constraint.
- **Alternatives considered**:
  - Add a dedicated search endpoint. Rejected because the feature requirements do not justify new server complexity or search-specific contracts yet.
  - Reuse only Products-page server props by lifting them into layout state. Rejected because the search must work on any dashboard route, not just where product data is already loaded.

## Decision 4: Keep route-specific refresh logic in the global controller, not inside the edit form

- **Decision**: Mirror the quick-create pattern by letting the controller that opened the global flow decide whether to call `router.refresh()` after a successful edit based on `usePathname()`.
- **Rationale**: The spec requires refresh only on `/dashboard/products`; all other routes must stay visually stable after edit completion. Centralizing that decision in a provider/controller keeps the form reusable and ensures the search flow and Products-page actions follow one explicit completion policy.
- **Alternatives considered**:
  - Always refresh after save. Rejected because it violates FR-011 and FR-012.
  - Never refresh after save. Rejected because the Products page needs updated data immediately after edits.

## Decision 5: Cover the orchestration with focused Vitest tests plus manual route checks

- **Decision**: Add React Testing Library coverage for the new provider/controller, search-result grouping/filtering, duplicate-open protection, search-close-before-edit behavior, and route-aware refresh outcomes, then manually validate on Products and non-Products pages.
- **Rationale**: This feature changes a global, user-visible workflow in the shared dashboard shell. Focused client tests provide strong regression protection without requiring a new end-to-end framework.
- **Alternatives considered**:
  - Manual validation only. Rejected because the constitution requires risk-proportional automated coverage for user-visible business logic.
  - Full E2E-only coverage. Rejected because the repository already has an effective Vitest/RTL setup for dashboard dialog providers and no established E2E workflow for this slice.
