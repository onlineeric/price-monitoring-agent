# Contract: Global Product Search Edit Flow

## Scope

This contract defines the shared UI and API interaction for searching products from the dashboard shell and editing a selected product without navigating away from the current route.

## Search Trigger Contract

- The existing dashboard header `Search` control and `Cmd/Ctrl + J` shortcut remain the entry points for the global search dialog.
- Opening the search dialog must work from any route rendered under the dashboard layout.
- Triggering the search flow while the search dialog or search-launched edit dialog is already open must be idempotent.

## Search Result Contract

- The search dialog must replace all template placeholder items with real products loaded from the application.
- The search input must filter results by product `name` and `url`.
- Matching results must be rendered in two sections:
  - `Active Products`
  - `Inactive Products`
- If no products match the current input, the dialog must show a clear empty-result state.
- If product loading fails, the dialog must show a recoverable error state rather than falling back to template content.

## Edit Flow Contract

- Selecting a product result must close the search dialog before opening the shared edit-product dialog.
- The edit dialog opened from search must use the same title, fields, validation, submit behavior, cancel behavior, loading state, success toast, and error toast as the Products page edit flow.
- Canceling or dismissing the edit dialog must end the flow and keep the user on the route where search started.
- After a successful edit:
  - If the current route is `/dashboard/products`, refresh the route once so updated product data is shown.
  - If the current route is any other dashboard page, do not refresh the route.
- After a successful or canceled edit launched from search, the search dialog must remain closed.

## API Contract

- Product search data continues to come from `GET /api/products`.
- Shared edit submission continues to `PATCH /api/products/:id` with:

```json
{
  "name": "Updated product name",
  "active": true
}
```

- Existing HTTP outcomes remain in force:
  - `200` returns the updated product
  - `404` indicates the product is unavailable
  - `500` indicates an update failure

## Verification Contract

- Automated coverage must prove:
  - real product results replace template items
  - filtering matches `name` and `url`
  - active results render before inactive results
  - duplicate trigger attempts do not stack dialogs
  - selecting a product closes search before opening edit
  - success refreshes only on `/dashboard/products`
  - cancel and failure leave the user on the current route without refresh
- Manual validation must confirm the full flow on `/dashboard/products` and at least one non-Products dashboard route.
