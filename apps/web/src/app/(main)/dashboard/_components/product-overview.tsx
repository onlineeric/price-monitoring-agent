import { db, desc, eq, priceRecords, products } from "@price-monitor/db";
import { Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export type ProductOverviewItem = {
  id: string;
  name: string | null;
  imageUrl: string | null;
  url: string;
  price: number | null;
  currency: string | null;
};

export async function getProductOverview(): Promise<ProductOverviewItem[]> {
  const result = await db.query.products.findMany({
    where: eq(products.active, true),
    columns: { id: true, name: true, imageUrl: true, url: true },
    with: {
      priceRecords: {
        columns: { price: true, currency: true },
        orderBy: [desc(priceRecords.scrapedAt)],
        limit: 1,
      },
    },
    limit: 120,
  });

  return result.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    url: p.url,
    price: p.priceRecords[0]?.price ?? null,
    currency: p.priceRecords[0]?.currency ?? null,
  }));
}

function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
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
                  <Image
                    src={product.imageUrl}
                    alt={product.name || "Product"}
                    width={80}
                    height={80}
                    unoptimized
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
