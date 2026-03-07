import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditProductDialog } from "@/app/(main)/dashboard/products/_components/edit-product-dialog";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={props.alt} {...props} />,
}));

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
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

const product = {
  id: "prod_1",
  url: "https://store.example.com/products/alpha",
  name: "Alpha Monitor",
  imageUrl: null,
  active: true,
  lastSuccessAt: null,
  lastFailedAt: null,
  createdAt: null,
  updatedAt: null,
  currentPrice: null,
  currency: "USD",
  lastChecked: null,
  priceHistory: [],
};

describe("EditProductDialog", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
  });

  it("closes and refreshes after a successful save", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        product: {
          id: product.id,
          url: product.url,
          name: "Updated Name",
          imageUrl: null,
          active: true,
          updatedAt: "2026-03-07T00:00:00.000Z",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<EditProductDialog product={product} open onOpenChange={onOpenChange} />);

    await user.clear(screen.getByLabelText(/product name/i));
    await user.type(screen.getByLabelText(/product name/i), "Updated Name");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does not refresh when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<EditProductDialog product={product} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
