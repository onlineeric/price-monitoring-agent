# Quickstart: Global Product Search Edit Dialog

## Goal

Verify that the top navigation search uses real products and launches the same edit-product dialog from any dashboard page without disrupting route context.

## Preconditions

1. Install dependencies with `pnpm install`.
2. Start backing services with `pnpm docker:up`.
3. Configure `.env` for the local dashboard.
4. Start the web app with `pnpm --filter @price-monitor/web dev`.
5. Ensure the database contains:
   - At least one active product
   - At least one inactive product
   - Products with distinct names and URLs so search matching is observable

## Automated Verification

1. Run targeted dashboard tests once implementation is complete:

```bash
pnpm --filter @price-monitor/web test -- --runInBand src/test/dashboard
```

2. Expected automated coverage:
   - Global search dialog loads real products instead of template items.
   - Search filtering matches both product name and URL.
   - Active products render before inactive products.
   - Selecting a product closes search and opens the shared edit dialog.
   - Save success refreshes only on `/dashboard/products`.
   - Save failure leaves the dialog open with retry available.
   - Duplicate-open attempts do not stack dialogs.

## Manual Verification

### Scenario 1: Search from a non-Products page

1. Open a dashboard page other than `/dashboard/products`.
2. Trigger the header search using the button and `Cmd/Ctrl+J`.
3. Confirm the dialog opens immediately and shows loading feedback until products are ready.
4. Search by part of a product name, then by part of a product URL.
5. Confirm active products appear before inactive products.
6. Select a product.
7. Confirm the search dialog closes before the edit dialog opens.
8. Save a change.
9. Confirm the edit dialog closes, the route stays the same, and the page does not refresh automatically.

### Scenario 2: Search from the Products page

1. Open `/dashboard/products`.
2. Trigger the header search and select a product.
3. Save a change in the edit dialog.
4. Confirm the page remains on `/dashboard/products` and refreshes to show updated data.

### Scenario 3: Cancel and error handling

1. Open search and select a product.
2. Cancel the edit dialog.
3. Confirm the flow ends without reopening search or refreshing the page.
4. Reopen search, select a product, and simulate or force an update failure.
5. Confirm the edit dialog stays open, preserves the user input, and shows the standard error feedback.

### Scenario 4: Empty and unavailable states

1. Open search with no matching query results.
2. Confirm a clear empty-result state is shown.
3. Test with zero products available in the environment if feasible.
4. Confirm the dialog remains usable and does not render template placeholder items.
