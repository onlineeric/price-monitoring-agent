"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLink, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/format";

import { MiniPriceChart } from "./mini-price-chart";
import { calculatePriceChange } from "./price-change";
import type { ProductWithStats } from "./products-view";
import { useCheckPrice } from "./use-check-price";
import { useUpdateInfo } from "./use-update-info";

interface ProductDetailDialogProps {
  product: ProductWithStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** A single labeled metadata row; renders a muted placeholder when empty. */
function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
      <span className="text-right text-sm">{value ? value : <span className="text-muted-foreground/60">—</span>}</span>
    </div>
  );
}

/**
 * Reusable product detail dialog (FR-014). Surfaces image, name, source link,
 * current price + trend, the rich metadata + attributes list, and BOTH refresh
 * timestamps (info last updated vs price last checked). Missing fields render a
 * placeholder or hide their section. Reads everything from the already-loaded
 * ProductWithStats — no extra fetch.
 */
export function ProductDetailDialog({ product, open, onOpenChange }: ProductDetailDialogProps) {
  const { handleCheckPrice, checkingPriceId } = useCheckPrice();
  const { handleUpdateInfo, updatingInfoId } = useUpdateInfo();

  if (!product) return null;

  const priceChange = calculatePriceChange(product.priceHistory);
  const attributes = product.attributes ?? [];
  const hasAnyDetails =
    Boolean(product.description) ||
    Boolean(product.category) ||
    Boolean(product.brand) ||
    Boolean(product.countryOfOrigin) ||
    attributes.length > 0;

  const isChecking = checkingPriceId === product.id;
  const isUpdating = updatingInfoId === product.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[95vh] min-h-[24rem] w-[80vw] min-w-[20rem] max-w-[95vw] resize flex-col overflow-hidden sm:max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="line-clamp-2 pr-6">{product.name || "Unnamed product"}</DialogTitle>
          <DialogDescription asChild>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {hostnameOf(product.url)}
              <ExternalLink className="size-3" />
            </a>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 pr-4">
          <div className="space-y-4">
            {/* Image — natural size, capped on the longest edge so it never upscales/zooms */}
            <div className="flex justify-center">
              {product.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: render at natural size with a longest-edge cap; intrinsic dimensions are unknown and images are served unoptimized
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="max-h-96 max-w-96 rounded-md object-contain"
                />
              ) : (
                <div className="flex aspect-video w-full max-w-96 items-center justify-center rounded-md bg-muted">
                  <p className="text-muted-foreground text-sm">No image</p>
                </div>
              )}
            </div>

            {/* Price + trend */}
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
            {product.priceHistory.length > 0 && <MiniPriceChart data={product.priceHistory} />}

            <Separator />

            {/* Rich metadata */}
            {hasAnyDetails ? (
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <DetailRow label="Category" value={product.category} />
                  <DetailRow label="Brand" value={product.brand} />
                  <DetailRow label="Country of origin" value={product.countryOfOrigin} />
                </div>

                {product.description && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-sm">Description</p>
                    <p className="line-clamp-4 text-sm">{product.description}</p>
                  </div>
                )}

                {attributes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-sm">Specifications</p>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                      {attributes.map((attr, i) => (
                        // Index-keyed: persistence dedupes exact pairs, but rows
                        // saved before that fix may still repeat one — the index
                        // keeps React keys unique either way (list is static here).
                        <div key={`${i}-${attr.key}`} className="flex justify-between gap-2 border-b py-1">
                          <dt className="text-muted-foreground text-sm">{attr.key}</dt>
                          <dd className="text-right text-sm">{attr.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No additional details yet. Use “Update product info” to fetch them.
              </p>
            )}

            <Separator />

            {/* Both timestamps — the distinction the feature exists to surface */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground text-xs">
              <span>
                Info last updated:{" "}
                {product.infoUpdatedAt
                  ? formatDistanceToNow(new Date(product.infoUpdatedAt), { addSuffix: true })
                  : "Never"}
              </span>
              <span>
                Price last checked:{" "}
                {product.lastChecked
                  ? formatDistanceToNow(new Date(product.lastChecked), { addSuffix: true })
                  : "Never"}
              </span>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleCheckPrice(product.id)} disabled={isChecking}>
            <RefreshCw className={`mr-2 size-4 ${isChecking ? "animate-spin" : ""}`} />
            {isChecking ? "Checking..." : "Check price now"}
          </Button>
          <Button onClick={() => handleUpdateInfo(product.id)} disabled={isUpdating}>
            <Sparkles className={`mr-2 size-4 ${isUpdating ? "animate-spin" : ""}`} />
            {isUpdating ? "Updating..." : "Update product info"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
