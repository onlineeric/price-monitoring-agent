"use client";

import type { UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import type { ProductCreateFormInput } from "./product-create-form-schema";

interface ProductCreateFormProps {
  form: UseFormReturn<ProductCreateFormInput>;
  onCancel: () => void;
  onSubmit: (values: ProductCreateFormInput) => void | Promise<void>;
}

export function ProductCreateForm({ form, onCancel, onSubmit }: ProductCreateFormProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product URL *</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/product" {...field} />
              </FormControl>
              <FormDescription>The URL of the product page you want to monitor.</FormDescription>
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
                <Input placeholder="Leave empty to auto-detect" {...field} />
              </FormControl>
              <FormDescription>
                Optional. If not provided, the name will be auto-detected or set to "Detecting Product Name...".
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Adding..." : "Add Product"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
