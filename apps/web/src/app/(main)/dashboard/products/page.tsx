import { getAllProductsWithStats } from "@/lib/products/product-stats";

import { AddProductButton } from "./_components/add-product-button";
import { ProductsView } from "./_components/products-view";

export default async function ProductsPage() {
  const products = await getAllProductsWithStats();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-3xl">Products</h1>
          <p className="text-muted-foreground">
            Manage your {products.length} monitored product{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <AddProductButton />
      </div>

      {/* Products View (handles both card and table views) */}
      <ProductsView products={products} />
    </div>
  );
}
