import { describe, expect, it, vi } from "vitest";
import { recruiting } from "../src/recruiting";
describe("reviewed recruiting editions", () => {
  it("rejects malformed seasons before querying", async () => {
    for (const season of ["2027.5", "-1", "2036", "2027 OR 1=1"])
      expect(
        (await recruiting.request(`/?season=${encodeURIComponent(season)}`))
          .status,
      ).toBe(400);
  });
  it("reads one active edition and keeps the database observation date separate", async () => {
    const first = vi
      .fn()
      .mockResolvedValue({
        payload_json: JSON.stringify({
          edition: "a".repeat(64),
          coverage: { sources: 1 },
          sources: [{ published_on: "2026-04-28", url: "https://outside.invalid/release" }],
          stats_source: { publisher: "Outside Provider", url: "https://outside.invalid/stats" },
        }),
        first_recorded_at: "2026-09-05T00:00:00Z",
      });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const response = await recruiting.request("/", {}, { DB: { prepare } });
    expect(response.status).toBe(200);
    expect(bind).toHaveBeenCalledWith(2027);
    expect(prepare.mock.calls[0][0]).toContain("a.edition=r.edition");
    expect(await response.json()).toEqual({
      edition: "a".repeat(64),
      coverage: { sources: 1 },
      programs: [],
      first_recorded_at: "2026-09-05T00:00:00Z",
      source_receipt: {
        dataset: "basketball_recruiting",
        season: 2027,
        captured_at: "2026-09-05T00:00:00Z",
        source_rows: 1,
        sha256: "a".repeat(64),
        sha256_scope: "release_edition",
        integrity: "verified",
      },
    });
  });

  it("preserves recruiting facts while withholding provider references", async () => {
    const payload = {
      edition: "b".repeat(64),
      coverage: { sources: 2 },
      programs: [
        { id: 41, name: "UConn", host: "uconnhuskies.com", publisher: "UConn Athletics" },
        { id: 42, name: "", host: "empty.invalid" },
      ],
      sources: [{ id: "uconn", url: "https://uconnhuskies.com/release", publisher: "UConn Athletics" }],
      stats_source: { publisher: "SportsDataverse", url: "https://example.invalid/stats" },
      people: [{ key: "41-player", name: "Player", stats: { ppg: 12.4 } }],
      events: [{ id: "event-1", kind: "addition", source_id: "uconn" }],
    };
    const response = await recruiting.request(
      "/?season=2027",
      {},
      { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ payload_json: JSON.stringify(payload), first_recorded_at: "2026-09-20T00:00:00Z" }) }) }) } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.programs).toEqual([{ id: "41", name: "UConn" }]);
    expect(body.people).toEqual(payload.people);
    expect(body.events).toEqual(payload.events);
    expect(body.source_receipt).toEqual(expect.objectContaining({ integrity: "verified", source_rows: 2 }));
    const text = JSON.stringify(body);
    expect(text).not.toContain("uconnhuskies.com");
    expect(text).not.toContain("SportsDataverse");
    expect(text).not.toContain("Outside Provider");
  });
  it("returns missing coverage explicitly", async () => {
    expect(
      (
        await recruiting.request(
          "/?season=2028",
          {},
          {
            DB: {
              prepare: () => ({ bind: () => ({ first: async () => null }) }),
            },
          },
        )
      ).status,
    ).toBe(404);
  });
  it("returns a bounded retryable status when the edition read is busy", async () => {
    const prepare = vi.fn(() => { throw new Error("D1 busy"); });
    const response = await recruiting.request("/?season=2027", {}, { DB: { prepare } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The reviewed recruiting edition is temporarily unavailable." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
