"use client";

import { format } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { ManualReportPreviewPayload } from "./types";

interface ManualReportPreviewProps {
  preview: ManualReportPreviewPayload;
}

export function ManualReportPreview({ preview }: ManualReportPreviewProps) {
  const generatedAt = new Date(preview.generatedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{preview.subject}</CardTitle>
        <CardDescription>
          Reviewed at {format(generatedAt, "PPpp")} · {preview.productCount} product
          {preview.productCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <iframe
          title="Manual report preview"
          srcDoc={preview.html}
          className="h-[32rem] w-full rounded-md border bg-white"
          sandbox=""
        />
      </CardContent>
    </Card>
  );
}
