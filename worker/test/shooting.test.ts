import { describe, it, expect, vi } from "vitest";
import { shooting } from "../src/shooting";

describe("shooting evidence", () => {
  it("rejects malformed kinds, IDs and seasons without a query", async () => {
    for (const path of [
      "/coach/150",
      "/player/no",
      "/team/150?season=2026.5",
      "/team/150?season=0",
    ]) {
      expect((await shooting.request(path)).status).toBe(400);
    }
  });
  it("filters exact player IDs while preserving long event IDs and all games", async () => {
    const profile = { id: "7", games: [{ id: "1" }, { id: "2" }] };
    const first = vi
      .fn()
      .mockResolvedValue({
        payload_json: JSON.stringify(profile),
        edition: "edition",
        receipt_json: "{}",
      });
    const prepare = vi
      .fn()
      .mockImplementation(() => ({ bind: vi.fn().mockReturnValue({ first }) }));
    const batch = vi.fn().mockResolvedValue([
      {
        results: [
          {
            game_id: "1",
            payload_json: JSON.stringify([
              { id: "401804830116281260", team: "150", player: "7" },
              { id: "other", team: "150", player: "70" },
            ]),
          },
          {
            game_id: "2",
            payload_json: JSON.stringify([
              { id: "third", team: "248", player: "7" },
            ]),
          },
        ],
      },
    ]);
    const r = await shooting.request(
      "/player/7",
      {},
      { DB: { prepare, batch } },
    );
    expect(r.status).toBe(200);
    const data = (await r.json()) as { shots: { id: string; game: string }[] };
    expect(data.shots.map((s) => s.id)).toEqual([
      "401804830116281260",
      "third",
    ]);
    expect(data.shots.map((s) => s.game)).toEqual(["1", "2"]);
    expect(prepare.mock.calls[0][0]).toContain("s.edition=p.edition");
  });
  it("returns 404 for an absent profile", async () => {
    const env = {
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
    };
    expect((await shooting.request("/team/1", {}, env)).status).toBe(404);
  });
});
