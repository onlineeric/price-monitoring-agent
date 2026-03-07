import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProductSearchResultItem } from "@/app/(main)/dashboard/_components/product-search/product-search-result-item";
import { Command, CommandList } from "@/components/ui/command";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={props.alt} {...props} />,
}));

describe("ProductSearchResultItem", () => {
  it("renders fallback preview details for products without images", () => {
    render(
      <Command>
        <CommandList>
          <ProductSearchResultItem
            product={{
              id: "prod_1",
              url: "https://store.example.com/products/alpha",
              name: null,
              imageUrl: null,
              active: false,
              updatedAt: "2026-03-07T00:00:00.000Z",
              displayName: "Untitled product",
              hostname: "store.example.com",
              searchText: "untitled product https://store.example.com/products/alpha",
              statusGroup: "inactive",
            }}
            onSelect={vi.fn()}
          />
        </CommandList>
      </Command>,
    );

    expect(screen.getByText("Untitled product")).toBeInTheDocument();
    expect(screen.getByText("store.example.com")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("https://store.example.com/products/alpha")).toBeInTheDocument();
  });
});
