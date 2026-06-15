"use client";

import { useState } from "react";

import { Mail } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { useBulkRefreshSignal } from "./use-bulk-refresh-signal";

// Note: Authentication intentionally removed in this phase.
// Proper authentication will be added app-wide in a future phase.

type RefreshMode = "price" | "info";

export function ManualTriggerButton() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RefreshMode>("price");
  const { watchForCompletion } = useBulkRefreshSignal();

  // Reset to the documented default whenever the dialog closes, so the expensive
  // "info + price" option can never stay pre-selected from a previous run and get
  // triggered by accident (FR-017: the dialog defaults to price each time it opens).
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setMode("price");
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setOpen(false);
    setMode("price");

    // Start watching for completion BEFORE enqueuing the batch so the baseline
    // marker is captured before the worker can advance it — otherwise a fast or
    // empty batch can finish first and the "refresh available" signal never fires.
    const stopWatch = await watchForCompletion();

    try {
      const response = await fetch("/api/digest/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode }),
      });

      // Handle non-JSON responses (e.g., HTML error pages from proxies/gateways)
      let data: { success?: boolean; error?: string } | undefined;
      try {
        data = await response.json();
      } catch (_parseError) {
        // If JSON parsing fails, it's likely an HTML error page or network issue
        stopWatch();
        toast.error("Failed to trigger digest", {
          description: `Server returned invalid response (HTTP ${response.status})`,
        });
        return;
      }

      if (response.ok) {
        toast.success("Digest triggered successfully!", {
          description: "All products will be checked and email will be sent.",
        });
        // The batch runs in the background; the watch started above will surface a
        // "refresh available" signal once it finishes (no auto-refresh of the list).
      } else {
        stopWatch();
        toast.error("Failed to trigger digest", {
          description: data?.error || "Unknown error occurred",
        });
      }
    } catch (error) {
      stopWatch();
      toast.error("Failed to trigger digest", {
        description: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button disabled={loading} className="gap-2" size="lg">
          <Mail className="size-4" />
          {loading ? "Triggering..." : "Check All & Send Email"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Digest Trigger</AlertDialogTitle>
          <AlertDialogDescription>
            This will check all active products and send a digest email. Are you sure you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Refresh mode */}
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as RefreshMode)}
          className="gap-3 py-4"
        >
          <div className="flex items-start space-x-2">
            <RadioGroupItem value="price" id="mode-price" className="mt-1" />
            <Label htmlFor="mode-price" className="font-normal">
              <div>
                <p className="font-medium text-sm">Refresh all products' price</p>
                <p className="text-muted-foreground text-xs">Fast, default — updates prices only.</p>
              </div>
            </Label>
          </div>
          <div className="flex items-start space-x-2">
            <RadioGroupItem value="info" id="mode-info" className="mt-1" />
            <Label htmlFor="mode-info" className="font-normal">
              <div>
                <p className="font-medium text-sm">Refresh all products info (info + price)</p>
                <p className="text-muted-foreground text-xs">
                  Slower &amp; more expensive — re-extracts full metadata via AI for every product.
                </p>
              </div>
            </Label>
          </div>
        </RadioGroup>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
