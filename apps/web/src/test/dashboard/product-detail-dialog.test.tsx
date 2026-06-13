import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProductCardView } from "@/app/(main)/dashboard/products/_components/product-card-view";
import { ProductDetailDialog } from "@/app/(main)/dashboard/products/_components/product-detail-dialog";
import type { ProductWithStats } from "@/app/(main)/dashboard/products/_components/products-view";

vi.mock("next/image", () => ({
  // biome-ignore lint/performance/noImgElement: jsdom mock for next/image
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={props.alt} {...props} />,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseProduct: ProductWithStats = {
  id: "prod_1",
  url: "https://store.example.com/products/alpha",
  name: "Alpha Knife",
  imageUrl: null,
  active: true,
  lastSuccessAt: null,
  lastFailedAt: null,
  createdAt: null,
  updatedAt: null,
  currentPrice: 4950,
  currency: "USD",
  lastChecked: new Date("2026-06-10T00:00:00.000Z"),
  priceHistory: [], // empty → MiniPriceChart (recharts) is skipped in tests
  description: "A sharp 8-inch chef knife.",
  category: "Kitchen",
  brand: "Acme",
  countryOfOrigin: "Japan",
  attributes: [
    { key: "Material", value: "Stainless steel" },
    { key: "Length", value: "8 inch" },
  ],
  infoUpdatedAt: new Date("2026-06-12T00:00:00.000Z"),
};

const emptyProduct: ProductWithStats = {
  ...baseProduct,
  id: "prod_2",
  description: null,
  category: null,
  brand: null,
  countryOfOrigin: null,
  attributes: null,
  infoUpdatedAt: null,
  lastChecked: null,
};

describe("ProductDetailDialog — rendering", () => {
  it("shows metadata, the attributes list, and both refresh timestamps", () => {
    render(<ProductDetailDialog product={baseProduct} open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Kitchen");
    expect(dialog).toHaveTextContent("Acme");
    expect(dialog).toHaveTextContent("Japan");
    expect(dialog).toHaveTextContent("A sharp 8-inch chef knife.");
    // Attributes key/value list
    expect(dialog).toHaveTextContent("Material");
    expect(dialog).toHaveTextContent("Stainless steel");
    expect(dialog).toHaveTextContent("Length");
    // Both distinct timestamps
    expect(dialog).toHaveTextContent(/Info last updated:/i);
    expect(dialog).toHaveTextContent(/Price last checked:/i);
  });

  it("renders gracefully with no metadata (empty state + 'Never' timestamps)", () => {
    render(<ProductDetailDialog product={emptyProduct} open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/No additional details yet/i);
    // Both timestamps fall back to "Never"
    const neverCount = (dialog.textContent?.match(/Never/g) ?? []).length;
    expect(neverCount).toBe(2);
  });

  it("renders nothing when there is no product", () => {
    render(<ProductDetailDialog product={null} open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing when closed", () => {
    render(<ProductDetailDialog product={baseProduct} open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ProductCardView — open behaviour vs actions menu", () => {
  it("opens the detail dialog on card click", async () => {
    const user = userEvent.setup();
    render(<ProductCardView products={[baseProduct]} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByText("Alpha Knife"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does NOT open the detail dialog when the actions menu is opened", async () => {
    const user = userEvent.setup();
    render(<ProductCardView products={[baseProduct]} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    // The dropdown menu opened, but the detail dialog did not.
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
