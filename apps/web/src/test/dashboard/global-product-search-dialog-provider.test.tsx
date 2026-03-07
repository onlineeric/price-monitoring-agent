import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GlobalProductSearchDialogProvider } from "@/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider";
import { SearchDialog } from "@/app/(main)/dashboard/_components/sidebar/search-dialog";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={props.alt} {...props} />,
}));

const mockRefresh = vi.fn();
const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const products = [
  {
    id: "prod_active",
    url: "https://store.example.com/products/active",
    name: "Alpha Monitor",
    imageUrl: null,
    active: true,
    createdAt: "2026-03-06T00:00:00.000Z",
    updatedAt: "2026-03-06T00:00:00.000Z",
    lastSuccessAt: null,
    lastFailedAt: null,
  },
  {
    id: "prod_inactive",
    url: "https://archive.example.com/products/beta",
    name: "Beta Sensor",
    imageUrl: null,
    active: false,
    createdAt: "2026-03-05T00:00:00.000Z",
    updatedAt: "2026-03-05T00:00:00.000Z",
    lastSuccessAt: null,
    lastFailedAt: null,
  },
];

function renderProvider() {
  return render(
    <GlobalProductSearchDialogProvider>
      <SearchDialog />
    </GlobalProductSearchDialogProvider>,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("GlobalProductSearchDialogProvider", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockUsePathname.mockReset();
  });

  it("loads products with a loading state, filters by name and URL, and groups active products first", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferred<{
      ok: boolean;
      json: () => Promise<{ success: boolean; products: typeof products }>;
    }>();
    const fetchMock = vi.fn().mockImplementation(() => deferredResponse.promise);

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    await user.click(screen.getByRole("button", { name: /search/i }));

    expect(await screen.findByText("Loading products…")).toBeInTheDocument();

    deferredResponse.resolve({
      ok: true,
      json: async () => ({
        success: true,
        products,
      }),
    });

    expect(await screen.findByText("Active products")).toBeInTheDocument();
    expect(screen.getByText("Inactive products")).toBeInTheDocument();

    const activeItem = screen.getByText("Alpha Monitor");
    const inactiveItem = screen.getByText("Beta Sensor");
    expect(activeItem.compareDocumentPosition(inactiveItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/search products by name or url/i), "beta");
    expect(await screen.findByText("Beta Sensor")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Monitor")).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search products by name or url/i));
    await user.type(screen.getByPlaceholderText(/search products by name or url/i), "archive.example.com");
    expect(await screen.findByText("Beta Sensor")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Monitor")).not.toBeInTheDocument();
  });

  it("shows a dedicated empty state when there are no products", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, products: [] }),
    });

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(await screen.findByText("No products available yet.")).toBeInTheDocument();
  });

  it("shows a no-match empty state when filtering removes all results", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, products }),
    });

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    await user.click(screen.getByRole("button", { name: /search/i }));
    await screen.findByText("Alpha Monitor");
    await user.type(screen.getByPlaceholderText(/search products by name or url/i), "missing");

    expect(await screen.findByText("No matching products found.")).toBeInTheDocument();
  });

  it("opens from the keyboard shortcut, ignores duplicate opens, and restores focus on cancel", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, products }),
    });

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    const searchButton = screen.getByRole("button", { name: /search/i });
    searchButton.focus();

    fireEvent.keyDown(document, { key: "j", metaKey: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.click(searchButton);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(searchButton).toHaveFocus();
    });
  });

  it("selects a product, closes search before opening edit, keeps retries in place on save failure, and recovers from unavailable products", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/products") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, products }),
        });
      }

      if (url === "/api/products/prod_active" && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            product: products[0],
          }),
        });
      }

      if (url === "/api/products/prod_active" && init?.method === "PATCH") {
        return Promise.resolve({
          ok: false,
          json: async () => ({
            success: false,
            error: "Save failed",
          }),
        });
      }

      if (url === "/api/products/prod_inactive") {
        return Promise.resolve({
          ok: false,
          json: async () => ({
            success: false,
            error: "Product not found",
          }),
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    await user.click(screen.getByRole("button", { name: /search/i }));
    const searchDialog = await screen.findByRole("dialog");

    await user.click(within(searchDialog).getByText("Alpha Monitor"));

    await waitFor(() => {
      expect(screen.queryByText("Active products")).not.toBeInTheDocument();
    });

    expect(await screen.findByRole("heading", { name: "Edit Product" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/product name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Retry Product");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Retry Product")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /search/i }));
    const reopenedSearch = await screen.findByRole("dialog");
    await user.click(within(reopenedSearch).getByText("Beta Sensor"));

    expect(await screen.findByText("Product not found")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refreshes only after a successful save from the products route", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/products") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, products }),
        });
      }

      if (url === "/api/products/prod_active" && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            product: products[0],
          }),
        });
      }

      if (url === "/api/products/prod_active" && init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            product: {
              ...products[0],
              name: "Updated Alpha",
            },
          }),
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/products");

    renderProvider();

    await user.click(screen.getByRole("button", { name: /search/i }));
    const searchDialog = await screen.findByRole("dialog");
    await user.click(within(searchDialog).getByText("Alpha Monitor"));

    await user.clear(await screen.findByLabelText(/product name/i));
    await user.type(screen.getByLabelText(/product name/i), "Updated Alpha");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
