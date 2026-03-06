import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddProductDialog } from "@/app/(main)/dashboard/products/_components/add-product-dialog";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

describe("AddProductDialog", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("submits valid data and normalizes an empty name to null", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "prod_123" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<AddProductDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/product url/i), "https://example.com/product");
    await user.click(screen.getByRole("button", { name: /add product/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com/product",
        name: null,
      }),
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("Product added successfully!", {
      description: "The product has been added to your monitoring list.",
    });
  });

  it("shows validation errors and does not submit invalid data", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    render(<AddProductDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add product/i }));

    expect(await screen.findByText("URL is required")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows an error toast when submission fails", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Product already exists" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<AddProductDialog open onOpenChange={vi.fn()} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/product url/i), "https://example.com/product");
    await user.click(screen.getByRole("button", { name: /add product/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to add product", {
        description: "Product already exists",
      });
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
