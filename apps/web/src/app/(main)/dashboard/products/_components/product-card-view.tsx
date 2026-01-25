"use client";

import { useState } from "react";

import Image from "next/image";

import { formatDistanceToNow } from "date-fns";
import { MoreVertical, Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { DeleteProductDialog } from "./delete-product-dialog";
import { EditProductDialog } from "./edit-product-dialog";
import { MiniPriceChart } from "./mini-price-chart";
import type { ProductWithStats } from "./products-view";

interface ProductCardViewProps {
  products: ProductWithStats[];
}

export function ProductCardView({ products }: ProductCardViewProps) {
  const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<ProductWithStats | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(cents / 100);
  };

  const calculatePriceChange = (history: Array<{ date: Date; price: number }>) => {
    if (history.length < 2) return null;
    const oldest = history[0].price;
    const newest = history[history.length - 1].price;
    const change = ((newest - oldest) / oldest) * 100;
    return change;
  };

  return (
    <>
      <div className="grid @5xl/main:grid-cols-3 @xl/main:grid-cols-2 grid-cols-1 gap-4">
        {products.map((product) => {
          const priceChange = calculatePriceChange(product.priceHistory);

          return (
            <Card key={product.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="line-clamp-2 text-lg">
                      {product.name || "Detecting Product Name..."}
                    </CardTitle>
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 line-clamp-1 text-muted-foreground text-xs hover:underline"
                    >
                      {(() => {
                        try {
                          return new URL(product.url).hostname;
                        } catch {
                          return product.url;
                        }
                      })()}
                    </a>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={product.active ? "default" : "secondary"} className="text-xs">
                      {product.active ? "Active" : "Inactive"}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingProduct(product);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setDeletingProduct(product);
                            setIsDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pb-3">
                {/* Product Image */}
                {product.imageUrl ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                    <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-muted">
                    <p className="text-muted-foreground text-sm">No image</p>
                  </div>
                )}

                {/* Price Information */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-muted-foreground text-xs">Current Price</p>
                    <p className="font-bold text-2xl tabular-nums">
                      {product.currentPrice !== null ? formatPrice(product.currentPrice, product.currency) : "N/A"}
                    </p>
                  </div>
                  {priceChange !== null && (
                    <div className="flex items-center gap-1">
                      {priceChange > 0 ? (
                        <TrendingUp className="size-4 text-red-500" />
                      ) : (
                        <TrendingDown className="size-4 text-green-500" />
                      )}
                      <span className={`font-medium text-sm ${priceChange > 0 ? "text-red-500" : "text-green-500"}`}>
                        {priceChange > 0 ? "+" : ""}
                        {priceChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Mini Chart */}
                {product.priceHistory.length > 0 && <MiniPriceChart data={product.priceHistory} />}
              </CardContent>

              <CardFooter className="border-t pt-3 text-muted-foreground text-xs">
                Last checked:{" "}
                {product.lastChecked
                  ? formatDistanceToNow(new Date(product.lastChecked), { addSuffix: true })
                  : "Never"}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Dialogs */}
      {editingProduct && (
        <EditProductDialog
          product={editingProduct}
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingProduct(null);
          }}
        />
      )}
      {deletingProduct && (
        <DeleteProductDialog
          product={deletingProduct}
          open={isDeleteDialogOpen}
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
            if (!open) setDeletingProduct(null);
          }}
        />
      )}
    </>
  );
}
