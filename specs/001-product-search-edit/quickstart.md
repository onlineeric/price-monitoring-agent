# Quickstart: Global Product Search Edit Dialog

## Goal

Validate that the dashboard header search dialog shows real products, filters by name and URL, and launches the same edit-product workflow used on the Products page without navigating away.

## Prerequisites

- Install dependencies with `pnpm install`
- Start app dependencies with `pnpm docker:up`
- Configure `.env`
- Start the web app with `pnpm --filter @price-monitor/web dev`

## Implementation Notes

- Add a dashboard-scoped provider/controller near `dashboard-client-shell.tsx` to host the global product search and search-launched edit flow.
- Replace the hardcoded `searchItems` in `sidebar/search-dialog.tsx` with product data loaded from the existing `/api/products` route.
- Extract shared edit-product behavior so Products page actions and global search both use the same dialog logic and completion callbacks.
- Keep the search dialog and edit dialog mutually exclusive: search closes before edit opens, and the flow ends after save or cancel.
- Refresh route data only when the active route is `/dashboard/products`; other dashboard pages remain on the current route without refresh.
- Add Vitest + React Testing Library coverage in `apps/web/src/test/dashboard` for provider orchestration and search/edit behavior.

## Verification

1. Run `pnpm lint`.
2. Run `pnpm --filter @price-monitor/web test`.
3. Open `/dashboard/products`, launch the header search, verify real products load, filter by product name and URL, and confirm active results appear before inactive results.
4. From `/dashboard/products`, select a result, save an edit, and verify the shared edit dialog closes and the page refreshes once.
5. Open at least one non-Products dashboard route, launch the same search flow, select a result, and verify save closes the dialog without route navigation or refresh.
6. On both routes, verify:
   - empty-result messaging appears when no products match
   - cancel closes the edit flow without saving
   - failed save keeps the edit dialog open and shows an error toast
   - repeated trigger attempts do not stack search or edit dialogs
   - unavailable product handling leaves the user in a usable state
