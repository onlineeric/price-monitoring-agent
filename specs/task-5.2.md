# Technical Spec: Phase 5.2 - Products Management Page

**Phase:** 5.2
**Goal:** Build a comprehensive Products management page with card/table views, CRUD operations, and real-time feedback.
**Context:** This is the main management interface where users can view all monitored products, add new products, edit existing ones, and delete products. Features two view modes (cards with mini charts, and sortable/filterable table) with Shadcn UI components and React Hook Form validation.

---

## Prerequisites

* **Task 5.0:** Dashboard template setup complete.
* **Task 5.1:** Dashboard home page complete.
* **Database:** Products and priceRecords tables exist.
* **Template:** TanStack Table components available in `src/components/data-table`.

---

## Architecture Context

### Products Page Features

**Two View Modes:**
1. **Card View** (default)
   - Product image, name, current price
   - Mini price history chart (last 30 days, sparkline style)
   - Visual badges for status (active/inactive)
   - Quick action buttons (Edit, Delete)
   - Responsive grid layout (3 columns on large, 2 on medium, 1 on small)

2. **Table View**
   - TanStack Table with sortable columns
   - Columns: Thumbnail, Name, Current Price, Last Checked, Status, Actions
   - Client-side filtering and sorting
   - Pagination (10 items per page)
   - Compact view for seeing many products at once

**View Toggle:**
- Button group to switch between card and table views
- User preference persisted in localStorage
- Smooth transition between views

**Add Product Dialog:**
- Shadcn Dialog component
- React Hook Form with Zod validation
- Fields: URL (required), Name (optional, defaults to "Untitled Product")
- Validates URL format
- Shows loading state during submission
- Toast notification on success/error
- Auto-refreshes product list on success

**Edit Product Dialog:**
- Same dialog as Add, but pre-filled with product data
- Can update: Name, Active status
- URL is read-only (cannot be changed)
- Shows product image for reference

**Delete Confirmation:**
- Shadcn AlertDialog for confirmation
- Shows product name to prevent accidental deletion
- Warning about cascade deletion of price records
- Destructive action styling

**Real-time Feedback:**
- Sonner toast notifications for all actions
- Success messages: "Product added successfully"
- Error messages with details
- Loading states on all async operations

**No Authentication:**
- All operations publicly accessible (demo purposes)
- No login required
- No user ownership model

---

## Step 1: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement the Products management page.

### File 1.1: `apps/web/src/app/(main)/dashboard/products/page.tsx`

**Goal:** Main products page with view toggle and data fetching.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, products, priceRecords } from '@price-monitor/db';
  import { eq, desc, gte, sql } from 'drizzle-orm';
  import { subDays } from 'date-fns';
  import { Plus } from 'lucide-react';

  import { Button } from '@/components/ui/button';
  import { ProductsView } from './_components/products-view';
  import { AddProductButton } from './_components/add-product-button';
  ```

* **Data Fetching Function:**
  ```typescript
  async function getProductsWithStats() {
    // Get all products
    const allProducts = await db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt));

    // For each product, get current price and price history (last 30 days)
    const productsWithStats = await Promise.all(
      allProducts.map(async (product) => {
        // Get latest price
        const [latestPrice] = await db
          .select()
          .from(priceRecords)
          .where(eq(priceRecords.productId, product.id))
          .orderBy(desc(priceRecords.scrapedAt))
          .limit(1);

        // Get price history for last 30 days
        const thirtyDaysAgo = subDays(new Date(), 30);
        const priceHistory = await db
          .select()
          .from(priceRecords)
          .where(eq(priceRecords.productId, product.id))
          .where(gte(priceRecords.scrapedAt, thirtyDaysAgo))
          .orderBy(priceRecords.scrapedAt);

        return {
          ...product,
          currentPrice: latestPrice?.price || null,
          currency: latestPrice?.currency || 'USD',
          lastChecked: latestPrice?.scrapedAt || null,
          priceHistory: priceHistory.map((record) => ({
            date: record.scrapedAt,
            price: record.price,
          })),
        };
      })
    );

    return productsWithStats;
  }
  ```

* **Page Component:**
  ```typescript
  export default async function ProductsPage() {
    const products = await getProductsWithStats();

    return (
      <div className="@container/main flex flex-col gap-4 md:gap-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Products</h1>
            <p className="text-muted-foreground">
              Manage your {products.length} monitored product{products.length !== 1 ? 's' : ''}
            </p>
          </div>
          <AddProductButton />
        </div>

        {/* Products View (handles both card and table views) */}
        <ProductsView products={products} />
      </div>
    );
  }
  ```

### File 1.2: `apps/web/src/app/(main)/dashboard/products/_components/products-view.tsx`

**Goal:** Client component that handles view toggle and renders either card or table view.

**Requirements:**

* **"use client" directive** (for state management)

* **Imports:**
  ```typescript
  'use client';

  import { useState, useEffect } from 'react';
  import { LayoutGrid, Table } from 'lucide-react';

  import { Button } from '@/components/ui/button';
  import { ProductCardView } from './product-card-view';
  import { ProductTableView } from './product-table-view';
  ```

* **Types:**
  ```typescript
  export type ProductWithStats = {
    id: string;
    url: string;
    name: string;
    imageUrl: string | null;
    active: boolean;
    lastSuccessAt: Date | null;
    lastFailedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    currentPrice: number | null;
    currency: string;
    lastChecked: Date | null;
    priceHistory: Array<{
      date: Date;
      price: number;
    }>;
  };

  type ViewMode = 'card' | 'table';
  ```

* **Component Implementation:**
  ```typescript
  interface ProductsViewProps {
    products: ProductWithStats[];
  }

  export function ProductsView({ products }: ProductsViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('card');

    // Load preference from localStorage
    useEffect(() => {
      const saved = localStorage.getItem('products-view-mode');
      if (saved === 'card' || saved === 'table') {
        setViewMode(saved);
      }
    }, []);

    // Save preference to localStorage
    const handleViewChange = (mode: ViewMode) => {
      setViewMode(mode);
      localStorage.setItem('products-view-mode', mode);
    };

    return (
      <div className="flex flex-col gap-4">
        {/* View Toggle */}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant={viewMode === 'card' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewChange('card')}
            className="gap-2"
          >
            <LayoutGrid className="size-4" />
            Card View
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewChange('table')}
            className="gap-2"
          >
            <Table className="size-4" />
            Table View
          </Button>
        </div>

        {/* Render appropriate view */}
        {products.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground mb-4">
              No products yet. Add your first product to start monitoring prices.
            </p>
          </div>
        ) : viewMode === 'card' ? (
          <ProductCardView products={products} />
        ) : (
          <ProductTableView products={products} />
        )}
      </div>
    );
  }
  ```

### File 1.3: `apps/web/src/app/(main)/dashboard/products/_components/product-card-view.tsx`

**Goal:** Card grid view with images, prices, and mini charts.

**Requirements:**

* **"use client" directive** (for interactive elements)

* **Imports:**
  ```typescript
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
  ```

* **Component Implementation:**
  ```typescript
  interface ProductCardViewProps {
    products: ProductWithStats[];
  }

  export function ProductCardView({ products }: ProductCardViewProps) {
    const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null);
    const [deletingProduct, setDeletingProduct] = useState<ProductWithStats | null>(null);

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
                        {product.name}
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
                          <DropdownMenuItem onClick={() => setEditingProduct(product)}>
                            <Pencil className="size-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingProduct(product)}
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
            open={!!editingProduct}
            onOpenChange={(open) => !open && setEditingProduct(null)}
          />
        )}
        {deletingProduct && (
          <DeleteProductDialog
            product={deletingProduct}
            open={!!deletingProduct}
            onOpenChange={(open) => !open && setDeletingProduct(null)}
          />
        )}
      </>
    );
  }
  ```

### File 1.4: `apps/web/src/app/(main)/dashboard/products/_components/product-table-view.tsx`

**Goal:** TanStack Table view with sorting and filtering.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import Image from 'next/image';
  import { useState } from 'react';
  import { formatDistanceToNow } from 'date-fns';
  import type { ColumnDef } from '@tanstack/react-table';
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
  ```

* **Component Implementation:**
  ```typescript
  interface ProductTableViewProps {
    products: ProductWithStats[];
  }

  export function ProductTableView({ products }: ProductTableViewProps) {
    const [editingProduct, setEditingProduct] = useState<ProductWithStats | null>(null);
    const [deletingProduct, setDeletingProduct] = useState<ProductWithStats | null>(null);

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
              <p className="font-medium truncate">{name}</p>
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
                <DropdownMenuItem onClick={() => setEditingProduct(product)}>
                  <Pencil className="size-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeletingProduct(product)}
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

    return (
      <>
        <DataTable columns={columns} data={products} />

        {/* Dialogs */}
        {editingProduct && (
          <EditProductDialog
            product={editingProduct}
            open={!!editingProduct}
            onOpenChange={(open) => !open && setEditingProduct(null)}
          />
        )}
        {deletingProduct && (
          <DeleteProductDialog
            product={deletingProduct}
            open={!!deletingProduct}
            onOpenChange={(open) => !open && setDeletingProduct(null)}
          />
        )}
      </>
    );
  }
  ```

### File 1.5: `apps/web/src/app/(main)/dashboard/products/_components/mini-price-chart.tsx`

**Goal:** Small sparkline chart for price history in card view.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import { Area, AreaChart, ResponsiveContainer } from 'recharts';
  ```

* **Component Implementation:**
  ```typescript
  interface MiniPriceChartProps {
    data: Array<{
      date: Date;
      price: number;
    }>;
  }

  export function MiniPriceChart({ data }: MiniPriceChartProps) {
    // Transform data for recharts
    const chartData = data.map((item) => ({
      date: item.date.toISOString(),
      price: item.price / 100, // Convert cents to dollars
    }));

    // Determine if trend is up or down
    const firstPrice = chartData[0]?.price || 0;
    const lastPrice = chartData[chartData.length - 1]?.price || 0;
    const isUpTrend = lastPrice > firstPrice;

    return (
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isUpTrend ? '#ef4444' : '#10b981'}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={isUpTrend ? '#ef4444' : '#10b981'}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="price"
              stroke={isUpTrend ? '#ef4444' : '#10b981'}
              strokeWidth={2}
              fill="url(#priceGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }
  ```

### File 1.6: `apps/web/src/app/(main)/dashboard/products/_components/add-product-button.tsx`

**Goal:** Button that opens add product dialog.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import { useState } from 'react';
  import { Plus } from 'lucide-react';

  import { Button } from '@/components/ui/button';
  import { AddProductDialog } from './add-product-dialog';
  ```

* **Component Implementation:**
  ```typescript
  export function AddProductButton() {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)} size="lg" className="gap-2">
          <Plus className="size-4" />
          Add Product
        </Button>
        <AddProductDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }
  ```

### File 1.7: `apps/web/src/app/(main)/dashboard/products/_components/add-product-dialog.tsx`

**Goal:** Dialog for adding new products with form validation.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import { useRouter } from 'next/navigation';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { useForm } from 'react-hook-form';
  import * as z from 'zod';
  import { toast } from 'sonner';

  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog';
  import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
  } from '@/components/ui/form';
  import { Input } from '@/components/ui/input';
  import { Button } from '@/components/ui/button';
  ```

* **Validation Schema:**
  ```typescript
  const formSchema = z.object({
    url: z
      .string()
      .min(1, 'URL is required')
      .url('Must be a valid URL'),
    name: z
      .string()
      .optional()
      .transform((val) => val || undefined),
  });

  type FormData = z.infer<typeof formSchema>;
  ```

* **Component Implementation:**
  ```typescript
  interface AddProductDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }

  export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps) {
    const router = useRouter();

    const form = useForm<FormData>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        url: '',
        name: '',
      },
    });

    const onSubmit = async (data: FormData) => {
      try {
        const response = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: data.url,
            name: data.name || 'Untitled Product',
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to add product');
        }

        toast.success('Product added successfully!', {
          description: 'The product has been added to your monitoring list.',
        });

        form.reset();
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error('Failed to add product', {
          description: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>
              Add a new product to monitor. Enter the URL and optionally provide a custom name.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product URL *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/product"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The URL of the product page you want to monitor.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Leave empty to auto-detect"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. If not provided, the name will be auto-detected or set to
                      "Untitled Product".
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? 'Adding...' : 'Add Product'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }
  ```

### File 1.8: `apps/web/src/app/(main)/dashboard/products/_components/edit-product-dialog.tsx`

**Goal:** Dialog for editing existing products.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import { useRouter } from 'next/navigation';
  import { useEffect } from 'react';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { useForm } from 'react-hook-form';
  import * as z from 'zod';
  import { toast } from 'sonner';
  import Image from 'next/image';

  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog';
  import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
  } from '@/components/ui/form';
  import { Input } from '@/components/ui/input';
  import { Button } from '@/components/ui/button';
  import { Switch } from '@/components/ui/switch';
  import type { ProductWithStats } from './products-view';
  ```

* **Validation Schema:**
  ```typescript
  const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    active: z.boolean(),
  });

  type FormData = z.infer<typeof formSchema>;
  ```

* **Component Implementation:**
  ```typescript
  interface EditProductDialogProps {
    product: ProductWithStats;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }

  export function EditProductDialog({
    product,
    open,
    onOpenChange,
  }: EditProductDialogProps) {
    const router = useRouter();

    const form = useForm<FormData>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: product.name,
        active: product.active,
      },
    });

    // Reset form when product changes
    useEffect(() => {
      form.reset({
        name: product.name,
        active: product.active,
      });
    }, [product, form]);

    const onSubmit = async (data: FormData) => {
      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to update product');
        }

        toast.success('Product updated successfully!', {
          description: 'Your changes have been saved.',
        });

        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error('Failed to update product', {
          description: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product details. URL cannot be changed.
            </DialogDescription>
          </DialogHeader>

          {/* Product Preview */}
          <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/50">
            {product.imageUrl ? (
              <div className="relative size-16 overflow-hidden rounded-md bg-muted flex-shrink-0">
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="size-16 overflow-hidden rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-muted-foreground">No img</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{product.name}</p>
              <p className="text-xs text-muted-foreground truncate">{product.url}</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Product name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Enable or disable price monitoring for this product.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }
  ```

### File 1.9: `apps/web/src/app/(main)/dashboard/products/_components/delete-product-dialog.tsx`

**Goal:** Confirmation dialog for deleting products.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import { useRouter } from 'next/navigation';
  import { useState } from 'react';
  import { toast } from 'sonner';

  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog';
  import type { ProductWithStats } from './products-view';
  ```

* **Component Implementation:**
  ```typescript
  interface DeleteProductDialogProps {
    product: ProductWithStats;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }

  export function DeleteProductDialog({
    product,
    open,
    onOpenChange,
  }: DeleteProductDialogProps) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
      setIsDeleting(true);

      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: 'DELETE',
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to delete product');
        }

        toast.success('Product deleted successfully', {
          description: 'The product and all its price records have been removed.',
        });

        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error('Failed to delete product', {
          description: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      } finally {
        setIsDeleting(false);
      }
    };

    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{product.name}</strong> and all its
              price records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Product'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  ```

### File 1.10: `apps/web/src/app/api/products/route.ts`

**Goal:** API endpoints for listing and creating products.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { db, products } from '@price-monitor/db';
  import { eq, desc } from 'drizzle-orm';
  ```

* **GET Handler (List All Products):**
  ```typescript
  export async function GET() {
    try {
      const allProducts = await db
        .select()
        .from(products)
        .orderBy(desc(products.createdAt));

      return NextResponse.json({
        success: true,
        products: allProducts,
      });
    } catch (error) {
      console.error('[API] Error fetching products:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch products',
        },
        { status: 500 }
      );
    }
  }
  ```

* **POST Handler (Create Product):**
  ```typescript
  export async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const { url, name } = body;

      // Validate required fields
      if (!url || typeof url !== 'string') {
        return NextResponse.json(
          { success: false, error: 'URL is required' },
          { status: 400 }
        );
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid URL format' },
          { status: 400 }
        );
      }

      // Check if product with this URL already exists
      const [existing] = await db
        .select()
        .from(products)
        .where(eq(products.url, url))
        .limit(1);

      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: 'A product with this URL already exists',
            product: existing,
          },
          { status: 409 }
        );
      }

      // Create product
      const [newProduct] = await db
        .insert(products)
        .values({
          url,
          name: name || 'Untitled Product',
          active: true,
        })
        .returning();

      return NextResponse.json({
        success: true,
        product: newProduct,
      });
    } catch (error) {
      console.error('[API] Error creating product:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create product',
        },
        { status: 500 }
      );
    }
  }
  ```

### File 1.11: `apps/web/src/app/api/products/[id]/route.ts`

**Goal:** API endpoints for getting, updating, and deleting individual products.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { db, products } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  ```

* **GET Handler (Get Single Product):**
  ```typescript
  export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1);

      if (!product) {
        return NextResponse.json(
          { success: false, error: 'Product not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        product,
      });
    } catch (error) {
      console.error('[API] Error fetching product:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch product',
        },
        { status: 500 }
      );
    }
  }
  ```

* **PATCH Handler (Update Product):**
  ```typescript
  export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      const body = await request.json();
      const { name, active } = body;

      // Build update object
      const updateData: Partial<{
        name: string;
        active: boolean;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      if (name !== undefined && typeof name === 'string') {
        updateData.name = name;
      }
      if (active !== undefined && typeof active === 'boolean') {
        updateData.active = active;
      }

      // Update product
      const [updated] = await db
        .update(products)
        .set(updateData)
        .where(eq(products.id, params.id))
        .returning();

      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Product not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        product: updated,
      });
    } catch (error) {
      console.error('[API] Error updating product:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update product',
        },
        { status: 500 }
      );
    }
  }
  ```

* **DELETE Handler (Delete Product):**
  ```typescript
  export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    try {
      // Delete product (cascade will delete related records)
      const [deleted] = await db
        .delete(products)
        .where(eq(products.id, params.id))
        .returning();

      if (!deleted) {
        return NextResponse.json(
          { success: false, error: 'Product not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Product deleted successfully',
      });
    } catch (error) {
      console.error('[API] Error deleting product:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete product',
        },
        { status: 500 }
      );
    }
  }
  ```

---

## Step 2: Verification (Manual Step)

### 2.1: Start Development Server

```bash
cd apps/web
pnpm dev
```

### 2.2: Verify Products Page Display

Open `http://localhost:3000/dashboard/products` and verify:

- [ ] Page loads without errors
- [ ] Header shows "Products" title and count
- [ ] "Add Product" button appears in header
- [ ] View toggle buttons (Card View / Table View) appear
- [ ] Default view is Card View
- [ ] If no products exist, shows empty state message

### 2.3: Test Card View

If you have products in the database:

- [ ] Products display in card grid (3 columns on large screens)
- [ ] Each card shows product image (or placeholder)
- [ ] Card shows product name and hostname
- [ ] Card shows current price (or "N/A")
- [ ] Card shows active/inactive badge
- [ ] Card shows mini price chart (if price history exists)
- [ ] Card shows price change percentage (if history exists)
- [ ] Card shows "Last checked" timestamp
- [ ] Three-dot menu opens with Edit/Delete options
- [ ] Cards are responsive (adapt to screen size)

### 2.4: Test Table View

Click "Table View" button and verify:

- [ ] View switches to table layout
- [ ] Table shows image thumbnails
- [ ] Table shows product names and hostnames
- [ ] Table shows current prices
- [ ] Table shows "Last checked" timestamps
- [ ] Table shows status badges
- [ ] Table has action menu in each row
- [ ] Columns are sortable (click headers)
- [ ] Table has pagination (if more than 10 items)
- [ ] View preference persists on page reload

### 2.5: Test Add Product

Click "Add Product" button and verify:

1. Dialog opens with form
2. Enter a valid URL (e.g., `https://example.com/product`)
3. Optionally enter a name
4. Click "Add Product"
5. Verify:
   - [ ] Loading state shows ("Adding...")
   - [ ] Success toast appears
   - [ ] Dialog closes
   - [ ] Page refreshes and shows new product
6. Test validation:
   - [ ] Empty URL shows error
   - [ ] Invalid URL format shows error
   - [ ] Duplicate URL shows error

### 2.6: Test Edit Product

Click Edit from a product's action menu and verify:

1. Dialog opens with pre-filled form
2. Product preview shows at top
3. URL is visible but not editable
4. Change the name
5. Toggle the active switch
6. Click "Save Changes"
7. Verify:
   - [ ] Loading state shows ("Saving...")
   - [ ] Success toast appears
   - [ ] Dialog closes
   - [ ] Page refreshes and shows updated data

### 2.7: Test Delete Product

Click Delete from a product's action menu and verify:

1. Alert dialog opens with confirmation
2. Product name is shown in warning message
3. Warning about cascade deletion is visible
4. Click "Delete Product"
5. Verify:
   - [ ] Loading state shows ("Deleting...")
   - [ ] Success toast appears
   - [ ] Dialog closes
   - [ ] Page refreshes and product is gone
6. Test cancel:
   - [ ] Clicking "Cancel" closes dialog without deleting

### 2.8: Test API Endpoints Directly

**List all products:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/products"
```

**Create product:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/products" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"https://example.com/test","name":"Test Product"}'
```

**Get single product:**
```powershell
$productId = "your-product-uuid"
Invoke-WebRequest -Uri "http://localhost:3000/api/products/$productId"
```

**Update product:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/products/$productId" `
  -Method PATCH `
  -ContentType "application/json" `
  -Body '{"name":"Updated Name","active":false}'
```

**Delete product:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/products/$productId" `
  -Method DELETE
```

### 2.9: Check Console for Errors

Open browser DevTools and verify:
- [ ] No console errors
- [ ] No network request failures
- [ ] All API calls return expected responses

---

## File Structure After Completion

```
apps/web/src/app/(main)/dashboard/products/
├── page.tsx                                  # NEW: Main products page with data fetching
├── _components/
│   ├── products-view.tsx                    # NEW: View toggle and layout switcher
│   ├── product-card-view.tsx                # NEW: Card grid view
│   ├── product-table-view.tsx               # NEW: TanStack Table view
│   ├── mini-price-chart.tsx                 # NEW: Small sparkline chart
│   ├── add-product-button.tsx               # NEW: Add button component
│   ├── add-product-dialog.tsx               # NEW: Add product form dialog
│   ├── edit-product-dialog.tsx              # NEW: Edit product form dialog
│   └── delete-product-dialog.tsx            # NEW: Delete confirmation dialog

apps/web/src/app/api/
├── products/
│   ├── route.ts                             # NEW: GET (list) and POST (create)
│   └── [id]/
│       └── route.ts                         # NEW: GET (one), PATCH (update), DELETE
└── (other existing routes)

apps/web/src/components/
├── data-table/                              # FROM TEMPLATE: TanStack Table components
│   ├── data-table.tsx
│   ├── data-table-column-header.tsx
│   ├── data-table-pagination.tsx
│   └── data-table-view-options.tsx
└── ui/                                      # FROM TEMPLATE: Shadcn UI components
    ├── card.tsx
    ├── badge.tsx
    ├── button.tsx
    ├── dialog.tsx
    ├── alert-dialog.tsx
    ├── form.tsx
    ├── input.tsx
    ├── switch.tsx
    └── (other UI components)
```

---

## Design Patterns

### Card View Layout
- Grid layout with responsive columns
- Product image with aspect ratio container
- Price display with large, tabular numerals
- Mini chart for visual trend indication
- Action menu in card header
- Status badge for quick visual reference

### Table View Layout
- Compact, information-dense layout
- Image thumbnails (smaller than card view)
- Sortable columns for all relevant fields
- Action menu in dedicated column
- Pagination for handling many products

### Form Validation
- Zod schema for type-safe validation
- React Hook Form for form state management
- Real-time validation feedback
- Clear error messages
- Disabled submit button during submission

### State Management
- Server Components for data fetching (no client-side loading states)
- Client Components only where needed (forms, dialogs, view toggle)
- localStorage for view preference persistence
- router.refresh() for data revalidation after mutations

---

## Styling Notes

**Card View:**
- Uses template's Card component variants
- Responsive grid with container queries (@container/main)
- Image aspect ratio: 16:9 (aspect-video)
- Typography: Large price numbers (text-2xl), small metadata (text-xs)

**Table View:**
- Uses template's DataTable component
- Fixed column widths for images (size-12)
- Max-width for name column to prevent overflow
- Tabular numerals for prices
- Muted text for secondary information

**Dialogs:**
- Max width: 500px for forms
- Proper spacing between form fields (space-y-4)
- Destructive styling for delete actions
- Loading states on all buttons

**Charts:**
- Height: 4rem (h-16) for mini charts
- Area chart with gradient fill
- Color: Red for uptrend, green for downtrend
- No animation for performance

---

## Troubleshooting

### Issue: Images don't load

**Cause:** Next.js Image component requires domain whitelist.

**Solution:** Add domains to `next.config.mjs`:
```javascript
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};
```

### Issue: Charts not rendering

**Cause:** Recharts dependency missing.

**Solution:**
```bash
cd apps/web
pnpm add recharts
```

### Issue: Form validation not working

**Cause:** Missing dependencies for React Hook Form or Zod.

**Solution:** Verify these are installed (should be from template):
```bash
pnpm add react-hook-form @hookform/resolvers zod
```

### Issue: Table not sortable

**Cause:** DataTableColumnHeader not used in column definitions.

**Solution:** Ensure all sortable columns use `DataTableColumnHeader` component in header render function.

### Issue: View preference not persisting

**Cause:** localStorage access before hydration.

**Solution:** The `useEffect` hook ensures localStorage is only accessed after mount. Check browser console for hydration errors.

### Issue: API returns 404 for new routes

**Cause:** Next.js dev server needs restart after creating new API routes.

**Solution:** Stop and restart `pnpm dev`.

### Issue: Delete doesn't cascade to price records

**Cause:** Database foreign key constraint not configured.

**Solution:** Verify `priceRecords` table has `ON DELETE CASCADE` in schema:
```typescript
productId: uuid('product_id')
  .notNull()
  .references(() => products.id, { onDelete: 'cascade' }),
```

---

## Completion Criteria

Task 5.2 is complete when:

- [ ] Products page renders without errors
- [ ] Card view displays products with images, prices, and charts
- [ ] Table view displays products with sortable columns
- [ ] View toggle switches between card and table views
- [ ] View preference persists in localStorage
- [ ] Add Product dialog opens and validates input
- [ ] Add Product successfully creates new products
- [ ] Edit Product dialog opens with pre-filled data
- [ ] Edit Product successfully updates products
- [ ] Delete Product dialog shows confirmation
- [ ] Delete Product successfully removes products
- [ ] All operations show toast notifications
- [ ] API endpoints (GET, POST, PATCH, DELETE) work correctly
- [ ] Duplicate URL validation prevents conflicts
- [ ] Empty state shows when no products exist
- [ ] Page is responsive on all screen sizes
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Build completes successfully

---

## Performance Notes

- Server Components for data fetching (no client-side loading states)
- Price history limited to 30 days to reduce data transfer
- Images use Next.js Image component for optimization
- Charts use `isAnimationActive={false}` for instant rendering
- Table pagination limits rendered rows
- View preference cached in localStorage

---

## Future Enhancements (Out of Scope)

- Bulk actions (select multiple products)
- Export products to CSV
- Filtering by status, price range, or site
- Search functionality
- Product categories/tags
- Manual price check trigger per product
- Price history detail page
- Image upload for custom product images
- Bulk import from CSV
- Product notes/comments
- Price alerts configuration per product
