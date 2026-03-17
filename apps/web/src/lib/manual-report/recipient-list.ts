import { z } from "zod";

const emailSchema = z.string().email("Invalid email address");

const MAX_RECIPIENTS = 3;

export interface RecipientValidationResult {
  recipients: string[];
  errors: string[];
}

function normalizeRecipient(input: string) {
  return input.trim().toLowerCase();
}

export function parseRecipientList(rawInput: string): string[] {
  return rawInput
    .split(",")
    .map((entry) => normalizeRecipient(entry))
    .filter(Boolean);
}

export function validateRecipientList(recipients: string[]): RecipientValidationResult {
  const errors: string[] = [];

  if (recipients.length === 0) {
    errors.push("At least one recipient is required.");
  }

  if (recipients.length > MAX_RECIPIENTS) {
    errors.push("You can send to at most 3 recipients per report.");
  }

  const uniqueRecipients = new Set(recipients);
  if (uniqueRecipients.size !== recipients.length) {
    errors.push("Duplicate recipient email addresses are not allowed.");
  }

  for (const recipient of recipients) {
    const parsed = emailSchema.safeParse(recipient);
    if (!parsed.success) {
      errors.push(`Invalid recipient email: ${recipient}`);
    }
  }

  return {
    recipients: Array.from(uniqueRecipients),
    errors,
  };
}

export function parseAndValidateRecipientInput(rawInput: string): RecipientValidationResult {
  return validateRecipientList(parseRecipientList(rawInput));
}
