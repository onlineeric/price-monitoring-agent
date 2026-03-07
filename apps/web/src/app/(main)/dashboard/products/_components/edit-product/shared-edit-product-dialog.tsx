"use client";

import { useEffect } from "react";

import Image from "next/image";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import {
  editProductFormSchema,
  getEditProductFormDefaultValues,
  type EditProductFormInput,
} from "./edit-product-form-schema";
import { useEditProduct } from "./use-edit-product";

export type SharedEditProductDialogProduct = {
  id: string;
  url: string;
  name: string | null;
  imageUrl: string | null;
  active: boolean;
};

interface SharedEditProductDialogProps {
  product: SharedEditProductDialogProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveSuccess?: (updatedProduct: {
    id: string;
    url: string;
    name: string | null;
    imageUrl: string | null;
    active: boolean;
    updatedAt: string;
  }) => void;
}

export function SharedEditProductDialog({ product, open, onOpenChange, onSaveSuccess }: SharedEditProductDialogProps) {
  const { editProduct } = useEditProduct();
  const form = useForm<EditProductFormInput>({
    resolver: zodResolver(editProductFormSchema as unknown as Parameters<typeof zodResolver>[0]),
    defaultValues: getEditProductFormDefaultValues(product),
  });

  useEffect(() => {
    form.reset(getEditProductFormDefaultValues(product));
  }, [form, product]);

  useEffect(() => {
    if (!open) {
      form.reset(getEditProductFormDefaultValues(product));
    }
  }, [form, open, product]);

  const handleSubmit = async (data: EditProductFormInput) => {
    const result = await editProduct(product.id, data);

    if (!result.success || !result.product) {
      return;
    }

    onSaveSuccess?.(result.product);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
          <DialogDescription>Update product details. URL cannot be changed.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          {product.imageUrl ? (
            <div className="relative size-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
              <Image
                src={product.imageUrl}
                alt={product.name ?? "Product image"}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex size-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              <span className="text-muted-foreground text-xs">No img</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{product.name || "Detecting Product Name..."}</p>
            <p className="break-all text-muted-foreground text-xs">{product.url}</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                    <FormDescription>Enable or disable price monitoring for this product.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
