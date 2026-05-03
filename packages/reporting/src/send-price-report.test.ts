import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendPriceReportEmail } from "./send-price-report";

/**
 * sendPriceReportEmail is the only path the worker uses to deliver digests.
 * Tests pin recipient routing (1 = direct, >1 = bcc), error envelope shape,
 * and dev-mode subject prefixing.
 */

const baseInput = {
  generatedAt: new Date("2026-03-05T12:00:00Z"),
  products: [],
  // Pre-rendered to avoid pulling React Email into the unit-test path.
  subject: "Price Monitor Report - March 5, 2026",
  html: "<p>hi</p>",
};

function makeFakeResend(responseOverrides: { id?: string | null; errorMessage?: string } = {}) {
  const send = vi.fn().mockResolvedValue(
    responseOverrides.errorMessage
      ? { data: null, error: { message: responseOverrides.errorMessage } }
      : { data: { id: responseOverrides.id ?? "msg-id-1" }, error: null },
  );
  return {
    client: { emails: { send } },
    send,
  };
}

describe("sendPriceReportEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_FROM;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a structured failure when no recipients are provided", async () => {
    const fake = makeFakeResend();
    const result = await sendPriceReportEmail({ ...baseInput, recipients: [] }, fake.client);
    expect(result).toEqual({
      success: false,
      providerMessageId: null,
      errorMessage: "At least one recipient is required.",
    });
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("sends directly to the single recipient (no BCC) for one-recipient digests", async () => {
    const fake = makeFakeResend();
    const result = await sendPriceReportEmail(
      { ...baseInput, recipients: ["alice@example.com"] },
      fake.client,
    );

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("msg-id-1");
    const payload = fake.send.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload?.to).toBe("alice@example.com");
    expect(payload?.bcc).toBeUndefined();
  });

  it("BCCs every recipient and uses the sender's address as `to` for multi-recipient sends (privacy guard)", async () => {
    process.env.EMAIL_FROM = "Price Monitor <reports@example.com>";
    const fake = makeFakeResend();
    await sendPriceReportEmail(
      {
        ...baseInput,
        recipients: ["alice@example.com", "bob@example.com"],
      },
      fake.client,
    );
    const payload = fake.send.mock.calls[0]?.[0];
    expect(payload?.to).toBe("reports@example.com");
    expect(payload?.bcc).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("prefixes the From header with `[dev] ` in development so test sends are obvious in inboxes", async () => {
    process.env.NODE_ENV = "development";
    process.env.EMAIL_FROM = "Price Monitor <reports@example.com>";
    const fake = makeFakeResend();
    await sendPriceReportEmail({ ...baseInput, recipients: ["alice@example.com"] }, fake.client);
    expect(fake.send.mock.calls[0]?.[0].from).toBe("[dev] Price Monitor <reports@example.com>");
  });

  it("propagates the provider error message into the structured failure envelope", async () => {
    const fake = makeFakeResend({ errorMessage: "rate-limited" });
    const result = await sendPriceReportEmail(
      { ...baseInput, recipients: ["alice@example.com"] },
      fake.client,
    );
    expect(result).toEqual({ success: false, providerMessageId: null, errorMessage: "rate-limited" });
  });

  it("catches thrown errors from the provider and reports them in the same envelope shape", async () => {
    const send = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await sendPriceReportEmail(
      { ...baseInput, recipients: ["alice@example.com"] },
      { emails: { send } },
    );
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("network down");
  });

  it("falls back to a generic message when the thrown value isn't an Error", async () => {
    const send = vi.fn().mockRejectedValue("oops");
    const result = await sendPriceReportEmail(
      { ...baseInput, recipients: ["alice@example.com"] },
      { emails: { send } },
    );
    expect(result.errorMessage).toBe("Unknown provider error");
  });
});
