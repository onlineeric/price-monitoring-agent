# Quickstart: Global Quick Create Product Dialog

## Goal

Validate that the sidebar `Quick Create` action and the Products page `Add Product` button open the same shared create-product flow and submit through the same logic.

## Prerequisites

- Install dependencies with `pnpm install`
- Start the app dependencies with `pnpm docker:up`
- Configure `.env`
- Start the web app with `pnpm --filter @price-monitor/web dev`

## Implementation Notes

- Add a dashboard-scoped client controller/provider near the dashboard layout so one dialog host can be opened from any route in that shell.
- Refactor the existing product-create dialog into shared form/submission modules used by both entry points.
- Keep the `/api/products` request shape and success/error handling unchanged.

## Verification

1. Run `pnpm lint`.
2. Run the web test command added by this feature for the shared dialog controller and entry-point parity.
3. Open `/dashboard/products` and verify the page header `Add Product` button opens the dialog and still creates a product successfully.
4. Open at least two non-Products dashboard routes, use sidebar `Quick Create`, and verify the same dialog opens without route navigation.
5. On both entry points, verify:
   - invalid URL shows the same validation message
   - cancel closes the dialog without creating a product
   - successful submission closes the dialog, shows the success toast, and refreshes visible product data
   - repeated quick clicks do not stack multiple dialogs
