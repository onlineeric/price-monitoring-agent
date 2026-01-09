'use client';

import Image from 'next/image';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { useReactTable, getCoreRowModel, getSortedRowModel, type SortingState } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { EditProductDialog } from './edit-product-dialog';
import { DeleteProductDialog } from './delete-product-dialog';
import type { ProductWithStats } from './products-view';

interface ProductTableViewProps {
  products: ProductWithStats[];
}

export function ProductTableView({ products }: ProductTableViewProps) {
  const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<ProductWithStats | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(cents / 100);
  };

  const columns: ColumnDef<ProductWithStats>[] = [
    {
      accessorKey: 'imageUrl',
      header: 'Image',
      cell: ({ row }) => {
        const imageUrl = row.getValue('imageUrl') as string | null;
        const name = row.original.name;

        return imageUrl ? (
          <div className="relative size-12 overflow-hidden rounded-md bg-muted">
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="size-12 overflow-hidden rounded-md bg-muted flex items-center justify-center">
            <span className="text-xs text-muted-foreground">No img</span>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const name = row.getValue('name') as string;
        const url = row.original.url;
        const hostname = new URL(url).hostname;

        return (
          <div className="max-w-[300px]">
            <p className="font-medium truncate">{name || 'Detecting Product Name...'}</p>
            <p className="text-xs text-muted-foreground truncate">{hostname}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'currentPrice',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Current Price" />
      ),
      cell: ({ row }) => {
        const price = row.getValue('currentPrice') as number | null;
        const currency = row.original.currency;

        return (
          <div className="font-medium tabular-nums">
            {price !== null ? formatPrice(price, currency) : 'N/A'}
          </div>
        );
      },
    },
    {
      accessorKey: 'lastChecked',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Checked" />
      ),
      cell: ({ row }) => {
        const lastChecked = row.getValue('lastChecked') as Date | null;

        return (
          <div className="text-sm text-muted-foreground">
            {lastChecked
              ? formatDistanceToNow(new Date(lastChecked), { addSuffix: true })
              : 'Never'}
          </div>
        );
      },
    },
    {
      accessorKey: 'active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const active = row.getValue('active') as boolean;

        return (
          <Badge variant={active ? 'default' : 'secondary'}>
            {active ? 'Active' : 'Inactive'}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const product = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open menu</span>
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
      <DataTable table={table} columns={columns} />

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
