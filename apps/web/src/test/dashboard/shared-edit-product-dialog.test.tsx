import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SharedEditProductDialog } from "@/app/(main)/dashboard/products/_components/edit-product/shared-edit-product-dialog";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={props.alt} {...props} />,
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

const product = {
  id: "prod_1",
  url: "https://store.example.com/products/alpha",
  name: "Alpha Monitor",
  imageUrl: null,
  active: true,
};

describe("SharedEditProductDialog", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("reuses validation rules and submits successfully", async () => {
    const user = userEvent.setup();
    const onSaveSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        product: {
          ...product,
          name: "Renamed Monitor",
          updatedAt: "2026-03-07T00:00:00.000Z",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<SharedEditProductDialog product={product} open onOpenChange={vi.fn()} onSaveSuccess={onSaveSuccess} />);

    const nameInput = screen.getByLabelText(/product name/i);
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(nameInput, "Renamed Monitor");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/products/prod_1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Renamed Monitor",
          active: true,
        }),
      });
    });

    expect(onSaveSuccess).toHaveBeenCalledWith({
      ...product,
      name: "Renamed Monitor",
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("keeps the dialog open and preserves edits after a failed save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: "Update failed",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<SharedEditProductDialog product={product} open onOpenChange={vi.fn()} />);

    const nameInput = screen.getByLabelText(/product name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Retry Name");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to update product", {
        description: "Update failed",
      });
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(nameInput).toHaveValue("Retry Name");
  });
});
