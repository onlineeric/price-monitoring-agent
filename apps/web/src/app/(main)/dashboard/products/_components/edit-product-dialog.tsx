"use client";

import { useEffect } from "react";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

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

import type { ProductWithStats } from "./products-view";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface EditProductDialogProps {
  product: ProductWithStats;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProductDialog({ product, open, onOpenChange }: EditProductDialogProps) {
  const router = useRouter();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: product.name || "",
      active: product.active,
    },
  });

  // Reset form when product changes
  useEffect(() => {
    form.reset({
      name: product.name || "",
      active: product.active,
    });
  }, [product, form]);

  const onSubmit = async (data: FormData) => {
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update product");
      }

      toast.success("Product updated successfully!", {
        description: "Your changes have been saved.",
      });

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error("Failed to update product", {
        description: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
          <DialogDescription>Update product details. URL cannot be changed.</DialogDescription>
        </DialogHeader>

        {/* Product Preview */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          {product.imageUrl ? (
            <div className="relative size-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
              <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
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
