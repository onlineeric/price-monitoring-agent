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
import { Switch } from "@/components/ui/switch";

// Note: Authentication intentionally removed in this phase.
// Proper authentication will be added app-wide in a future phase.

export function ManualTriggerButton() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [forceAI, setForceAI] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    setOpen(false);

    try {
      const response = await fetch("/api/digest/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Handle non-JSON responses (e.g., HTML error pages from proxies/gateways)
      let data: { success?: boolean; error?: string } | undefined;
      try {
        data = await response.json();
      } catch (_parseError) {
        // If JSON parsing fails, it's likely an HTML error page or network issue
        toast.error("Failed to trigger digest", {
          description: `Server returned invalid response (HTTP ${response.status})`,
        });
        return;
      }

      if (response.ok) {
        toast.success("Digest triggered successfully!", {
          description: "All products will be checked and email will be sent.",
        });
      } else {
        toast.error("Failed to trigger digest", {
          description: data?.error || "Unknown error occurred",
        });
      }
    } catch (error) {
      toast.error("Failed to trigger digest", {
        description: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
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

        {/* Force AI Option (Disabled) */}
        <div className="flex items-center space-x-2 py-4">
          <Switch id="force-ai" checked={forceAI} onCheckedChange={setForceAI} disabled />
          <Label htmlFor="force-ai" className="text-sm">
            Force AI Extraction
          </Label>
        </div>
        <p className="-mt-2 ml-12 text-muted-foreground text-xs">(Feature under construction)</p>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
