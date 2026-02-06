import { db, desc, eq, priceRecords, products } from "@price-monitor/db";
import { Package } from "lucide-react";
import Link from "next/link";

import { formatPrice } from "@/lib/format";

export type ProductOverviewItem = {
  id: string;
  name: string | null;
  imageUrl: string | null;
  url: string;
  price: number | null;
  currency: string | null;
};

export async function getProductOverview(): Promise<ProductOverviewItem[]> {
  const latestPriceSq = db
    .selectDistinctOn([priceRecords.productId], {
      productId: priceRecords.productId,
      price: priceRecords.price,
      currency: priceRecords.currency,
    })
    .from(priceRecords)
    .orderBy(priceRecords.productId, desc(priceRecords.scrapedAt))
    .as("latestPrice");

  return db
    .select({
      id: products.id,
      name: products.name,
      imageUrl: products.imageUrl,
      url: products.url,
      price: latestPriceSq.price,
      currency: latestPriceSq.currency,
    })
    .from(products)
    .leftJoin(latestPriceSq, eq(products.id, latestPriceSq.productId))
    .where(eq(products.active, true))
    .limit(120);
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProductOverview({ products }: { products: ProductOverviewItem[] }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-xl">Product Overview</h2>
        <Link href="/dashboard/products" className="text-muted-foreground text-sm hover:text-primary">
          View all &rarr;
        </Link>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {products.map((product) => (
            <Link
              key={product.id}
              href="/dashboard/products"
              className="group rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
            >
              <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name || "Product"}
                    className="size-full object-contain"
                  />
                ) : (
                  <Package className="size-8 text-muted-foreground" />
                )}
              </div>
              <p className="line-clamp-2 font-medium text-sm leading-tight">
                {product.name || "Unnamed Product"}
              </p>
              <p className="mt-1 truncate text-muted-foreground text-xs">{getHostname(product.url)}</p>
              <p className="mt-1 font-semibold text-sm">
                {product.price != null ? formatPrice(product.price, product.currency ?? "USD") : "N/A"}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center">
          <Package className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="text-muted-foreground">No products being monitored yet.</p>
          <Link href="/dashboard/products" className="mt-2 inline-block text-primary text-sm hover:underline">
            Add your first product &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
