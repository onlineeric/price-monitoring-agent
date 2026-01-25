import { Resend } from "resend";
import PriceDigest from "../emails/PriceDigest.js";
import type { ProductDigestItem } from "../emails/PriceDigest.js";

// Re-export the type for consumers
export type { ProductDigestItem };

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Parameters for sending digest email
 */
export interface SendDigestParams {
  to: string;
  products: ProductDigestItem[];
}

/**
 * Send a price digest email
 * @returns true if email was sent successfully, false otherwise
 */
export async function sendDigestEmail(
  params: SendDigestParams
): Promise<boolean> {
  try {
    const generatedAt = new Date();

    const emailFrom = (process.env.NODE_ENV === "development" ? "[dev] " : "") + 
        (process.env.EMAIL_FROM || "Price Monitor <onboarding@resend.dev>");

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: params.to,
      subject: `Price Monitor Report - ${generatedAt.toLocaleDateString()}`,
      react: PriceDigest({
        products: params.products,
        generatedAt,
      }),
    });

    if (error) {
      console.error("[Email] Failed to send digest:", error);
      return false;
    }

    console.log("[Email] Digest sent successfully:", data?.id);
    return true;
  } catch (error) {
    console.error("[Email] Error sending digest:", error);
    return false;
  }
}
