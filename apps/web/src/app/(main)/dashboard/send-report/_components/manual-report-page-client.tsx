"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { formatDistanceToNowStrict } from "date-fns";
import { Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { parseAndValidateRecipientInput, parseRecipientList } from "@/lib/manual-report/recipient-list";

import { ManualReportPreview } from "./manual-report-preview";
import { RecipientInput } from "./recipient-input";
import type { ManualReportPreviewPayload, ManualReportSendAvailabilityPayload } from "./types";

interface PreviewResponseBody {
  preview?: ManualReportPreviewPayload;
  availability?: ManualReportSendAvailabilityPayload;
  error?: {
    code: string;
    message: string;
  };
}

interface SendResponseBody {
  success?: boolean;
  recipientCount?: number;
  generatedAt?: string;
  availability?: ManualReportSendAvailabilityPayload;
  error?: {
    code: string;
    message: string;
  };
}

function getLimitMessage(
  availability: ManualReportSendAvailabilityPayload | null,
  recipientCount: number,
): string | null {
  if (!availability) {
    return null;
  }

  if (availability.reason === "no-active-products") {
    return "No active products are available in the current report snapshot.";
  }

  if (availability.reason === "rolling-window-limit" && availability.blockedUntil) {
    const blockedUntil = new Date(availability.blockedUntil);
    if (!Number.isNaN(blockedUntil.getTime())) {
      return `Send limit reached. Try again in ${formatDistanceToNowStrict(blockedUntil)}.`;
    }
  }

  if (availability.reason === "daily-recipient-limit") {
    return "Daily recipient limit reached for this business day.";
  }

  if (availability.dailyRecipientsUsed + recipientCount > availability.dailyRecipientsLimit) {
    const remaining = Math.max(0, availability.dailyRecipientsLimit - availability.dailyRecipientsUsed);
    return `This send exceeds the daily limit. Remaining recipients today: ${remaining}.`;
  }

  return null;
}

export function ManualReportPageClient() {
  const [preview, setPreview] = useState<ManualReportPreviewPayload | null>(null);
  const [availability, setAvailability] = useState<ManualReportSendAvailabilityPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipientErrors, setRecipientErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const recipientCount = parseRecipientList(recipientInput).length;
  const limitMessage = getLimitMessage(availability, recipientCount);

  const loadPreview = useEffectEvent(async () => {
    setLoadingPreview(true);
    setPreviewError(null);

    try {
      const response = await fetch("/api/manual-report/preview");
      const body = (await response.json()) as PreviewResponseBody;

      if (!response.ok || !body.preview || !body.availability) {
        setPreview(null);
        setAvailability(null);
        setPreviewError(body.error?.message || "Unable to load report preview.");
        return;
      }

      setPreview(body.preview);
      setAvailability(body.availability);
    } catch (error) {
      setPreview(null);
      setAvailability(null);
      setPreviewError(error instanceof Error ? error.message : "Unable to load report preview.");
    } finally {
      setLoadingPreview(false);
    }
  });

  useEffect(() => {
    void loadPreview();
  }, []);

  async function handleSend() {
    if (!preview) {
      return;
    }

    const validation = parseAndValidateRecipientInput(recipientInput);
    setRecipientErrors(validation.errors);

    if (validation.errors.length > 0) {
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/manual-report/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          previewId: preview.previewId,
          recipients: validation.recipients,
        }),
      });

      const body = (await response.json()) as SendResponseBody;

      if (!response.ok || !body.success) {
        if (body.availability) {
          setAvailability(body.availability);
        }
        toast.error("Failed to send report", {
          description: body.error?.message || "Unable to send report right now.",
        });
        return;
      }

      if (body.availability) {
        setAvailability(body.availability);
      }

      toast.success("Report sent", {
        description: `Sent to ${body.recipientCount ?? validation.recipients.length} recipient(s).`,
      });
    } catch (error) {
      toast.error("Failed to send report", {
        description: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setSending(false);
    }
  }

  const sendDisabled =
    loadingPreview ||
    sending ||
    !preview ||
    !availability ||
    !availability.canSend ||
    recipientCount === 0 ||
    recipientCount > 3 ||
    limitMessage !== null;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-3xl">Send Report to Emails</h1>
        <p className="text-muted-foreground">
          Preview the current stored report and send it directly without running a product refresh.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
        <div>
          {loadingPreview ? (
            <Card>
              <CardHeader>
                <CardTitle>Loading preview...</CardTitle>
                <CardDescription>Building reviewed report snapshot.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {!loadingPreview && previewError ? (
            <Card>
              <CardHeader>
                <CardTitle>Preview unavailable</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert variant="destructive">
                  <AlertTitle>Unable to generate preview</AlertTitle>
                  <AlertDescription>{previewError}</AlertDescription>
                </Alert>
                <Button onClick={() => void loadPreview()} className="gap-2">
                  <RefreshCw className="size-4" />
                  Retry preview
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {!loadingPreview && !previewError && preview ? <ManualReportPreview preview={preview} /> : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
            <CardDescription>
              Rolling limit: {availability?.rollingWindowUsed ?? 0}/{availability?.rollingWindowLimit ?? 3} sends ·
              Daily limit: {availability?.dailyRecipientsUsed ?? 0}/{availability?.dailyRecipientsLimit ?? 99} recipients
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RecipientInput
              value={recipientInput}
              onChange={(value) => {
                setRecipientInput(value);
                if (recipientErrors.length > 0) {
                  setRecipientErrors([]);
                }
              }}
              disabled={sending || loadingPreview}
              errors={recipientErrors}
            />

            {limitMessage ? (
              <Alert variant="destructive">
                <AlertTitle>Send blocked</AlertTitle>
                <AlertDescription>{limitMessage}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button onClick={handleSend} disabled={sendDisabled} className="gap-2">
              <Mail className="size-4" />
              {sending ? "Sending..." : "Send Report"}
            </Button>
            <Button variant="outline" onClick={() => void loadPreview()} disabled={loadingPreview || sending}>
              Regenerate Preview
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
