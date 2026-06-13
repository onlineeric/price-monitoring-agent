"use client";

import { useState } from "react";

import Image from "next/image";

import type { ColumnDef } from "@tanstack/react-table";
import { getCoreRowModel, getSortedRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrice } from "@/lib/format";

import { DeleteProductDialog } from "./delete-product-dialog";
import { EditProductDialog } from "./edit-product-dialog";
import { ProductDetailDialog } from "./product-detail-dialog";
import type { ProductWithStats } from "./products-view";
import { useCheckPrice } from "./use-check-price";
import { useUpdateInfo } from "./use-update-info";

interface ProductTableViewProps {
  products: ProductWithStats[];
}

export function ProductTableView({ products }: ProductTableViewProps) {
  const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ProductWithStats | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductWithStats | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const { handleCheckPrice, checkingPriceId } = useCheckPrice();
  const { handleUpdateInfo, updatingInfoId } = useUpdateInfo();

  const columns: ColumnDef<ProductWithStats>[] = [
    {
      accessorKey: "imageUrl",
      header: "Image",
      cell: ({ row }) => {
        const imageUrl = row.getValue("imageUrl") as string | null;
        const name = row.original.name;

        return imageUrl ? (
          <div className="relative size-12 overflow-hidden rounded-md bg-muted">
            <Image src={imageUrl} alt={name} fill className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="flex size-12 items-center justify-center overflow-hidden rounded-md bg-muted">
            <span className="text-muted-foreground text-xs">No img</span>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const name = row.getValue("name") as string;
        const url = row.original.url;
        let hostname: string;
        try {
          hostname = new URL(url).hostname;
        } catch {
          hostname = url;
        }

        return (
          <div className="max-w-[300px]">
            <p className="truncate font-medium">{name || "Detecting Product Name..."}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="truncate text-muted-foreground text-xs hover:underline"
            >
              {hostname}
            </a>
          </div>
        );
      },
    },
    {
      accessorKey: "currentPrice",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Current Price" />,
      cell: ({ row }) => {
        const price = row.getValue("currentPrice") as number | null;
        const currency = row.original.currency;

        return <div className="font-medium tabular-nums">{price !== null ? formatPrice(price, currency) : "N/A"}</div>;
      },
    },
    {
      accessorKey: "lastChecked",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Checked" />,
      cell: ({ row }) => {
        const lastChecked = row.getValue("lastChecked") as Date | null;

        return (
          <div className="text-muted-foreground text-sm">
            {lastChecked ? formatDistanceToNow(new Date(lastChecked), { addSuffix: true }) : "Never"}
          </div>
        );
      },
    },
    {
      accessorKey: "active",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const active = row.getValue("active") as boolean;

        return <Badge variant={active ? "default" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>;
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const product = row.original;

        return (
          // Stop row-click (which opens the detail dialog) from firing when the
          // user interacts with the actions menu. Keyboard users reach the menu
          // button directly, so this wrapper needs no keyboard handler.
          // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only guards click bubbling
          // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops mouse-event bubbling, not an interactive control
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleCheckPrice(product.id)}
                  disabled={checkingPriceId === product.id}
                >
                  <RefreshCw className={`mr-2 size-4 ${checkingPriceId === product.id ? "animate-spin" : ""}`} />
                  {checkingPriceId === product.id ? "Checking..." : "Check price now"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleUpdateInfo(product.id)}
                  disabled={updatingInfoId === product.id}
                >
                  <Sparkles className={`mr-2 size-4 ${updatingInfoId === product.id ? "animate-spin" : ""}`} />
                  {updatingInfoId === product.id ? "Updating..." : "Update product info"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setEditingProduct(product);
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
        );
      },
    },
  ];

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <>
      <DataTable table={table} columns={columns} onRowClick={(product) => setDetailProduct(product)} />

      {/* Dialogs */}
      <ProductDetailDialog
        product={detailProduct}
        open={detailProduct !== null}
        onOpenChange={(open) => {
          if (!open) setDetailProduct(null);
        }}
      />
      {editingProduct && (
        <EditProductDialog
          product={editingProduct}
          open
          onOpenChange={(open) => {
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
