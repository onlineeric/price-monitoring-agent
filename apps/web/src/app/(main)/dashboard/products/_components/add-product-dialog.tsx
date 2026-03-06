"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ProductCreateForm } from "./product-create-form";
import { productCreateFormDefaultValues, productCreateFormSchema, type ProductCreateFormInput } from "./product-create-form-schema";
import { useCreateProduct } from "./use-create-product";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddProductDialog({ open, onOpenChange, onSuccess }: AddProductDialogProps) {
  const { createProduct } = useCreateProduct();
  const form = useForm<ProductCreateFormInput>({
    resolver: zodResolver(productCreateFormSchema as unknown as Parameters<typeof zodResolver>[0]),
    defaultValues: productCreateFormDefaultValues,
  });

  useEffect(() => {
    if (!open) {
      form.reset(productCreateFormDefaultValues);
    }
  }, [form, open]);

  const handleSubmit = async (data: ProductCreateFormInput) => {
    const result = await createProduct(data);

    if (result.success) {
      form.reset();
      onSuccess?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
          <DialogDescription>
            Add a new product to monitor. Enter the URL and optionally provide a custom name.
          </DialogDescription>
        </DialogHeader>
        <ProductCreateForm form={form} onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  );
}
