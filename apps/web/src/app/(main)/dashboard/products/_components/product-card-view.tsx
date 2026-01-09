'use client';

import Image from 'next/image';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MoreVertical, Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditProductDialog } from './edit-product-dialog';
import { DeleteProductDialog } from './delete-product-dialog';
import { MiniPriceChart } from './mini-price-chart';
import type { ProductWithStats } from './products-view';

interface ProductCardViewProps {
  products: ProductWithStats[];
}

export function ProductCardView({ products }: ProductCardViewProps) {
  const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<ProductWithStats | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
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
                  <div className="flex-1 min-w-0">
                    <CardTitle className="line-clamp-2 text-lg">
                      {product.name || 'Detecting Product Name...'}
                    </CardTitle>
                    <CardDescription className="line-clamp-1 text-xs mt-1">
                      {new URL(product.url).hostname}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={product.active ? 'default' : 'secondary'} className="text-xs">
                      {product.active ? 'Active' : 'Inactive'}
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
                          <Pencil className="size-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setDeletingProduct(product);
                            setIsDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="size-4 mr-2" />
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
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No image</p>
                  </div>
                )}

                {/* Price Information */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Current Price</p>
                    <p className="text-2xl font-bold tabular-nums">
                      {product.currentPrice !== null
                        ? formatPrice(product.currentPrice, product.currency)
                        : 'N/A'}
                    </p>
                  </div>
                  {priceChange !== null && (
                    <div className="flex items-center gap-1">
                      {priceChange > 0 ? (
                        <TrendingUp className="size-4 text-red-500" />
                      ) : (
                        <TrendingDown className="size-4 text-green-500" />
                      )}
                      <span
                        className={`text-sm font-medium ${
                          priceChange > 0 ? 'text-red-500' : 'text-green-500'
                        }`}
                      >
                        {priceChange > 0 ? '+' : ''}
                        {priceChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Mini Chart */}
                {product.priceHistory.length > 0 && (
                  <MiniPriceChart data={product.priceHistory} />
                )}
              </CardContent>

              <CardFooter className="text-xs text-muted-foreground border-t pt-3">
                Last checked:{' '}
                {product.lastChecked
                  ? formatDistanceToNow(new Date(product.lastChecked), { addSuffix: true })
                  : 'Never'}
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
