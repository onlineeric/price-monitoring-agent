"use client";

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

const formSchema = z.object({
  url: z.string().min(1, "URL is required").url("Must be a valid URL"),
  name: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps) {
  const router = useRouter();

  const form = useForm<FormData>({
    // @ts-expect-error - Zod v3.23.8 type compatibility issue with @hookform/resolvers
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
      name: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      // Trim and convert empty strings to null (standardized representation)
      const trimmedName = data.name?.trim();
      const productName = trimmedName && trimmedName !== "" ? trimmedName : null;

      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: data.url,
          name: productName, // null if empty - worker will extract title
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to add product");
      }

      toast.success("Product added successfully!", {
        description: "The product has been added to your monitoring list.",
      });

      form.reset();
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error("Failed to add product", {
        description: error instanceof Error ? error.message : "Unknown error occurred",
      });
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Adding..." : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
