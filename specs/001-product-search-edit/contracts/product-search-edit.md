# Contract: Global Product Search Edit Flow

## Scope

This contract documents the client-side interfaces and existing API interactions required to replace template search items with real products and launch the shared edit-product dialog from global search.

## Existing API Contracts

### `GET /api/products`

- Purpose: Load product records for the global search dialog.
- Response shape:

```ts
type GetProductsResponse = {
  success: boolean;
  products?: Array<{
    id: string;
    url: string;
    name: string | null;
    imageUrl: string | null;
    active: boolean;
    createdAt: string;
    updatedAt: string;
    lastSuccessAt: string | null;
    lastFailedAt: string | null;
  }>;
  error?: string;
};
```

- Client expectations:
  - Fetch once per dashboard-shell lifecycle or when explicitly revalidated by the controller.
  - Normalize response data into search results sorted into active and inactive sections.
  - On failure, keep the dialog usable and render a recoverable error state instead of placeholder template items.

### `PATCH /api/products/:id`

- Purpose: Save product edits from the shared dialog.
- Request shape:

```ts
type PatchProductRequest = {
  name: string;
  active: boolean;
};
```

- Response shape:

```ts
type PatchProductResponse = {
  success: boolean;
  product?: {
    id: string;
    url: string;
    name: string | null;
    imageUrl: string | null;
    active: boolean;
    updatedAt: string;
  };
  error?: string;
};
```

- Client expectations:
  - Use the same validation and error handling regardless of whether the dialog is launched from Products or global search.
  - On success from global search:
    - Close the edit dialog.
    - Refresh only if `pathname === "/dashboard/products"`.
    - Do not reopen search.
  - On failure:
    - Keep the dialog open.
    - Preserve in-progress edits.
    - Surface the standard error feedback.

## Client Module Contracts

### Global Search/Edit Provider

```ts
type GlobalProductSearchDialogSource = "header-search-button" | "header-search-shortcut";

type OpenGlobalProductSearchOptions = {
  source: GlobalProductSearchDialogSource;
  trigger?: HTMLElement | null;
};

type GlobalProductSearchContextValue = {
  openGlobalProductSearch: (options: OpenGlobalProductSearchOptions) => void;
};
```

- Behavioral guarantees:
  - Ignores duplicate open requests while search or edit overlays are already active.
  - Restores focus to the originating trigger when the flow closes.
  - Captures the originating pathname to decide whether post-save refresh is required.

### Shared Edit Dialog Controller

```ts
type SharedEditProductDialogProps = {
  product: {
    id: string;
    url: string;
    name: string | null;
    imageUrl: string | null;
    active: boolean;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveSuccess?: (updatedProduct: {
    id: string;
    name: string | null;
    active: boolean;
    updatedAt: string;
  }) => void;
};
```

- Behavioral guarantees:
  - Uses the same schema and submit logic for all entry points.
  - Leaves route refresh decisions to the caller/controller rather than hard-coding `router.refresh()` inside the presentational form.

## UI State Contract

- Search dialog states:
  - `loading`
  - `ready`
  - `empty`
  - `error`
- Edit dialog states:
  - `closed`
  - `open`
  - `submitting`
  - `error-with-retry`
- Overlay sequencing:
  - Search selection must transition `search -> edit`.
  - Search and edit must never be visible simultaneously.
