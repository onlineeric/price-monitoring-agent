import { beforeEach, describe, expect, it, vi } from "vitest";

const addMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queue", () => ({
  priceQueue: {
    add: addMock,
  },
}));

import { POST } from "@/app/api/digest/trigger/route";

describe("POST /api/digest/trigger", () => {
  beforeEach(() => {
    addMock.mockReset();
  });

  it("keeps manual combined digest queue-based", async () => {
    addMock.mockResolvedValue({ id: "job_123" });

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith(
      "send-digest",
      expect.objectContaining({
        triggeredBy: "manual",
      }),
    );
  });

  it("returns a server error payload when enqueue fails", async () => {
    addMock.mockRejectedValue(new Error("Redis offline"));

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to trigger digest");
  });
});
