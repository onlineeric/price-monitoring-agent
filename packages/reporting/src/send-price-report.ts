import { Resend } from "resend";

import { renderPriceReport } from "./render-price-report";
import type { ReportSnapshotItem } from "./report-snapshot";

interface ResendClient {
  emails: {
    send: (payload: {
      from: string;
      to: string;
      bcc?: string[];
      subject: string;
      html: string;
    }) => Promise<{
      data?: { id?: string } | null;
      error?: { message: string } | null;
    }>;
  };
}

let _cachedResendClient: ResendClient | null = null;
const defaultSender = "Price Monitor <onboarding@resend.dev>";

function getResendClient(): ResendClient {
  if (_cachedResendClient) {
    return _cachedResendClient;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }

  _cachedResendClient = new Resend(key) as unknown as ResendClient;
  return _cachedResendClient;
}

function buildFromHeader() {
  const prefix = process.env.NODE_ENV === "development" ? "[dev] " : "";
  return `${prefix}${process.env.EMAIL_FROM || defaultSender}`;
}

function extractEmailAddress(address: string): string {
  const match = address.match(/<([^>]+)>/);
  if (match?.[1]) {
    return match[1].trim();
  }

  return address.trim();
}

export interface SendPriceReportEmailInput {
  recipients: string[];
  generatedAt: Date;
  products: ReportSnapshotItem[];
  subject?: string;
  html?: string;
}

export interface SendPriceReportEmailResult {
  success: boolean;
  providerMessageId: string | null;
  errorMessage?: string;
}

export async function sendPriceReportEmail(
  input: SendPriceReportEmailInput,
  resend?: ResendClient,
): Promise<SendPriceReportEmailResult> {
  try {
    if (input.recipients.length === 0) {
      return {
        success: false,
        providerMessageId: null,
        errorMessage: "At least one recipient is required.",
      };
    }

    const from = buildFromHeader();
    const senderAddress = extractEmailAddress(from);
    const rendered =
      input.subject && input.html
        ? { subject: input.subject, html: input.html }
        : await renderPriceReport({
            generatedAt: input.generatedAt,
            products: input.products,
          });

    const destination: { to: string; bcc?: string[] } =
      input.recipients.length === 1
        ? {
            to: input.recipients[0]!,
          }
        : {
            to: senderAddress,
            bcc: input.recipients,
          };

    const { data, error } = await (resend ?? getResendClient()).emails.send({
      from,
      ...destination,
      subject: rendered.subject,
      html: rendered.html,
    });

    if (error) {
      return {
        success: false,
        providerMessageId: null,
        errorMessage: error.message,
      };
    }

    return {
      success: true,
      providerMessageId: data?.id ?? null,
    };
  } catch (error) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: error instanceof Error ? error.message : "Unknown provider error",
    };
  }
}
