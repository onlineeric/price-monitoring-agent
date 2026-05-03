import { describe, expect, it } from "vitest";

import { buildPriceReportSubject } from "./price-digest-email";

/**
 * The subject line is the user-facing identifier of every digest email.
 * Lock the format so a stray locale change wouldn't silently rename every
 * future report.
 */

describe("buildPriceReportSubject", () => {
  it("renders the en-US long-form date in the subject (locale-formatted, local time)", () => {
    // Construct from local-time components so the assertion is independent of
    // CI/dev tz (the formatter renders in the runtime's locale).
    const subject = buildPriceReportSubject(new Date(2026, 2, 5, 12, 0, 0));
    expect(subject).toBe("Price Monitor Report - March 5, 2026");
  });

  it("starts with the brand prefix that ops filters on", () => {
    const subject = buildPriceReportSubject(new Date(2026, 11, 31, 12, 0, 0));
    expect(subject.startsWith("Price Monitor Report - ")).toBe(true);
  });
});
