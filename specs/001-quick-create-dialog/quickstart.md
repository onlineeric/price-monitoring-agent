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
- Mount the shared dialog host from a dashboard client shell so the sidebar and page content can call the same controller without route navigation.
- Refresh route data only when the active route is `/dashboard/products`; other dashboard routes keep their current page state after successful creation.
- Cover the shared controller with Vitest plus React Testing Library tests in `apps/web`.

## Verification

1. Run `pnpm lint`.
2. Run the web test command added by this feature for the shared dialog controller and entry-point parity.
3. Open `/dashboard/products` and verify the page header `Add Product` button opens the dialog and still creates a product successfully.
4. Open at least two non-Products dashboard routes, use sidebar `Quick Create`, and verify the same dialog opens without route navigation.
5. On both entry points, verify:
   - invalid URL shows the same validation message
   - cancel closes the dialog without creating a product
   - successful submission closes the dialog, shows the success toast, and refreshes visible product data only on `/dashboard/products`
   - repeated quick clicks do not stack multiple dialogs
   - focus returns to the button that opened the dialog after cancel, dismiss, or successful submission
