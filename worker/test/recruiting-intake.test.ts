import { describe, expect, it, vi } from "vitest";
import { recruitingIntake } from "../src/recruiting-intake";

describe("authorized recruiting intake coverage", () => {
  it("rejects malformed seasons", async () => {
    expect((await recruitingIntake.request("/?season=2027 OR 1=1")).status).toBe(400);
  });

  it("publishes counts and provider clocks without row payloads", async () => {
    const edition = "a".repeat(64);
    const first = vi.fn()
      .mockResolvedValueOnce({ total: 2, latest_captured_at: "2026-09-08T12:00:00Z" })
      .mockResolvedValueOnce({
        edition,
        latest_captured_at: "2026-09-08T13:00:00Z",
        rows: 383,
        ranked_rows: 100,
        committed_rows: 42,
        invalid_source_hashes: 0,
      });
    const all = vi.fn()
      .mockResolvedValueOnce({ results: [{ provider: "Licensed Feed", rows: 2, latest_captured_at: "2026-09-08T12:00:00Z" }] })
      .mockResolvedValueOnce({ results: [{ status: "reported_transfer", rows: 2 }] })
      .mockResolvedValueOnce({ results: [{ provider: "CollegeBasketballData.com API", kind: "portal", rows: 4, latest_captured_at: "2026-09-08T12:00:00Z" }] });
    const bind = vi.fn().mockReturnValue({ first, all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await recruitingIntake.request("/?season=2027&publication_check=unit", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; authorized_rows: number; intake_status: string; providers: unknown[]; statuses: unknown[]; provider_feeds: unknown[]; provider_capabilities: Array<{ provider: string; event_date_available: boolean; kinds: string[] }>; public_rankings: { rows: number; ranked_rows: number; committed_rows: number; edition: string; source_receipt: { dataset: string; source_rows: number; sha256: string | null; sha256_scope: string; integrity: string } }; policy: string };
    expect(body.total).toBe(2);
    expect(body.authorized_rows).toBe(6);
    expect(body.intake_status).toBe("rows_available");
    expect(body.providers).toHaveLength(1);
    expect(body.statuses).toHaveLength(1);
    expect(body.provider_feeds).toHaveLength(1);
    expect(body.public_rankings).toEqual(expect.objectContaining({
      rows: 383,
      ranked_rows: 100,
      committed_rows: 42,
      edition,
    }));
    expect(body.public_rankings.source_receipt).toEqual({
      dataset: "recruiting_rankings",
      captured_at: "2026-09-08T13:00:00Z",
      source_rows: 383,
      sha256: edition,
      sha256_scope: "release_edition",
      integrity: "verified",
    });
    expect(body.provider_capabilities).toEqual([
      expect.objectContaining({
        kinds: ["portal", "players", "teams"],
        event_date_available: false,
      }),
    ]);
    expect(body.policy).toContain("zero authorized-intake count means no licensed transfer/eligibility export");
    expect(JSON.stringify(body)).not.toContain("player_name");
  });

  it("returns an explicit unavailable coverage state when D1 is busy", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await recruitingIntake.request("/?season=2027", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      season: 2027,
      total: 0,
      authorized_rows: null,
      intake_status: "unavailable",
      source: "unavailable",
      unavailable_reason: expect.stringContaining("did not respond"),
    }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
