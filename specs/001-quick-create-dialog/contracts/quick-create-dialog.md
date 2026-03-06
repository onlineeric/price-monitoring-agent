# Contract: Global Quick Create Dialog

## Scope

This contract defines the shared UI behavior for opening and completing product creation from the dashboard sidebar and the Products page.

## Trigger Contract

- The sidebar `Quick Create` action must call the same shared open action as the Products page `Add Product` button.
- Both triggers must target one shared dialog host within the dashboard shell.
- Triggering the open action while the dialog is already open must be idempotent.

## Dialog Contract

- The dialog title, description, fields, validation rules, button labels, loading state, toasts, and submit behavior must match the existing Products page add-product experience.
- The dialog must remain dismissible via cancel and normal dialog close interactions.
- The dialog must not require the user to navigate to `/dashboard/products` before interacting with it.

## Submission Contract

- Submission must continue to `POST /api/products` with:

```json
{
  "url": "https://example.com/product",
  "name": "Optional name or null"
}
```

- Empty `name` input must be normalized to `null` before submission.
- Success must preserve the current behavior: success toast, form reset, dialog close, and route refresh.
- Failure must preserve the current behavior: error toast and dialog remains open.

## Verification Contract

- Automated coverage must prove both entry points use the same controller/open path.
- Automated coverage must prove repeated open requests do not create duplicate dialog state.
- Manual validation must confirm parity on the Products page and at least two additional dashboard routes.
