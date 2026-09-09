import { describe, expect, it, vi } from "vitest";
import { recruitingIntake } from "../src/recruiting-intake";

describe("authorized recruiting intake coverage", () => {
  it("rejects malformed seasons", async () => {
    expect((await recruitingIntake.request("/?season=2027 OR 1=1")).status).toBe(400);
  });

  it("publishes counts and provider clocks without row payloads", async () => {
    const first = vi.fn().mockResolvedValue({ total: 2, latest_captured_at: "2026-09-08T12:00:00Z" });
    const all = vi.fn()
      .mockResolvedValueOnce({ results: [{ provider: "Licensed Feed", rows: 2, latest_captured_at: "2026-09-08T12:00:00Z" }] })
      .mockResolvedValueOnce({ results: [{ status: "reported_transfer", rows: 2 }] })
      .mockResolvedValueOnce({ results: [{ provider: "CollegeBasketballData.com API", kind: "portal", rows: 4, latest_captured_at: "2026-09-08T12:00:00Z" }] });
    const bind = vi.fn().mockReturnValue({ first, all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await recruitingIntake.request("/", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; providers: unknown[]; statuses: unknown[]; provider_feeds: unknown[]; provider_capabilities: Array<{ provider: string; event_date_available: boolean; kinds: string[] }>; policy: string };
    expect(body.total).toBe(2);
    expect(body.providers).toHaveLength(1);
    expect(body.statuses).toHaveLength(1);
    expect(body.provider_feeds).toHaveLength(1);
    expect(body.provider_capabilities).toEqual([
      expect.objectContaining({
        provider: "CollegeBasketballData.com API",
        kinds: ["portal", "players", "teams"],
        event_date_available: false,
      }),
    ]);
    expect(body.policy).toContain("Coverage metadata only");
    expect(JSON.stringify(body)).not.toContain("player_name");
  });
});
