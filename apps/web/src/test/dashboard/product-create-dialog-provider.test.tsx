import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ProductCreateDialogProvider,
  useProductCreateDialog,
} from "@/app/(main)/dashboard/_components/product-create/product-create-dialog-provider";

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

beforeEach(() => {
  mockRefresh.mockReset();
  mockUsePathname.mockReset();
});

function TriggerHarness() {
  const { openProductCreateDialog } = useProductCreateDialog();

  return (
    <div>
      <button type="button" onClick={(event) => openProductCreateDialog("sidebar-quick-create", event.currentTarget)}>
        Quick Create
      </button>
      <button type="button" onClick={(event) => openProductCreateDialog("products-add-button", event.currentTarget)}>
        Add Product
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ProductCreateDialogProvider>
      <TriggerHarness />
    </ProductCreateDialogProvider>,
  );
}

describe("ProductCreateDialogProvider", () => {
  it("opens the same shared dialog from both entry points", async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    await user.click(screen.getByRole("button", { name: "Quick Create" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add Product" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/product url/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Add Product" }));

    const reopenedDialog = await screen.findByRole("dialog");
    expect(within(reopenedDialog).getByRole("heading", { name: "Add Product" })).toBeInTheDocument();
    expect(within(reopenedDialog).getByLabelText(/product name/i)).toBeInTheDocument();
  });

  it("ignores duplicate open requests and restores focus to the originating trigger", async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    const quickCreateButton = screen.getByRole("button", { name: "Quick Create" });

    await user.click(quickCreateButton);
    fireEvent.click(quickCreateButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(quickCreateButton).toHaveFocus();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("refreshes only on the products route after a successful submission", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "prod_123" }),
    });

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/products");

    renderProvider();

    await user.click(screen.getByRole("button", { name: "Add Product" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/product url/i), "https://example.com/product");
    await user.click(within(dialog).getByRole("button", { name: /^add product$/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not refresh after a successful submission outside the products route", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "prod_123" }),
    });

    vi.stubGlobal("fetch", fetchMock);
    mockUsePathname.mockReturnValue("/dashboard/default");

    renderProvider();

    await user.click(screen.getByRole("button", { name: "Quick Create" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/product url/i), "https://example.com/product");
    await user.click(within(dialog).getByRole("button", { name: /^add product$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
