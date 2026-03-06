# Research: Global Quick Create Product Dialog

## Decision 1: Host the dialog in the shared dashboard shell instead of routing to Products first

- **Decision**: Render a single create-product dialog host inside the dashboard layout client tree and expose an open action that any dashboard child, including the sidebar, can call.
- **Rationale**: The current sidebar and Products page both live under the same dashboard layout. Hosting the dialog at that shared level lets `Quick Create` open the same modal from any route without an intermediate navigation, preserves page context, and avoids route-coupled modal logic.
- **Alternatives considered**:
  - Navigate to `/dashboard/products` and auto-open the dialog there. Rejected because it changes route context, adds more moving parts, and creates more edge cases around close/cancel behavior.
  - Mount separate dialog instances on each page. Rejected because it duplicates stateful UI and increases the chance of drift between entry points.

## Decision 2: Extract shared create-product logic from the current Products page dialog

- **Decision**: Split the current `AddProductDialog` into reusable create-product modules: a shared schema/form component and a shared submit handler or hook, with thin trigger components for the sidebar flow and the Products page button.
- **Rationale**: The existing implementation keeps form schema, fetch call, toast handling, reset behavior, and dialog state tightly coupled to one dialog component. The user requirement is explicit that product creation logic must be reused, so the implementation should share actual code rather than duplicate markup and network behavior.
- **Alternatives considered**:
  - Reuse only the dialog copy and fields while duplicating fetch/submit logic. Rejected because it violates the requirement to share create logic and increases regression risk.
  - Move all logic into a large global component. Rejected because it would make the dashboard layout harder to maintain and reduce separation between triggers and form behavior.

## Decision 3: Use a dashboard-scoped client context/provider pattern

- **Decision**: Follow the repo’s existing provider/context style for shared client state by introducing a dedicated product-create dialog controller within the dashboard client tree.
- **Rationale**: The repo already uses provider-based shared state patterns, such as the preferences store provider in the app shell. A small dedicated controller matches existing architecture better than repurposing unrelated state or using ad hoc event wiring.
- **Alternatives considered**:
  - Use URL query params as the dialog source of truth. Rejected because the feature does not require shareable URLs and it would introduce routing complexity for a simple modal.
  - Use a global Zustand store. Rejected because the feature scope is limited to the dashboard shell and does not need app-wide persistent state.

## Decision 4: Add focused automated coverage for shared controller behavior

- **Decision**: Plan for targeted client-side tests around the shared dialog controller and entry-point parity, plus manual checks across multiple dashboard routes.
- **Rationale**: This feature changes a global user-visible workflow and introduces shared client orchestration. A focused test layer on the controller/open behavior reduces regression risk while keeping scope contained.
- **Alternatives considered**:
  - Manual verification only. Rejected because the constitution requires risk-proportional automated coverage for user-visible business logic unless there is a strong reason not to add it.
  - Full end-to-end coverage only. Rejected because the repo does not currently expose an existing web E2E workflow for this slice, and that would add more setup than the feature itself.
