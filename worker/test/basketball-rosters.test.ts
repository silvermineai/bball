import { describe, expect, it, vi } from "vitest";
import { basketballRosters } from "../src/basketball-rosters";

describe("live basketball roster observations", () => {
  it("rebuilds exact-ID movement and workload summaries from D1 rows", async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => ({
          results: sql.includes("FROM bb_rosters")
            ? args[0] === 2027
              ? [{ team_id: "new-team", athlete_id: "42", profile_json: JSON.stringify({ full_name: "Example Guard", team_display_name: "New U", position_abbreviation: "G", link_web: "https://example.test/player/42" }) }]
              : [{ team_id: "old-team", athlete_id: "42", profile_json: JSON.stringify({ full_name: "Example Guard", team_display_name: "Old U" }) }]
            : sql.includes("FROM bb_participation")
              ? args[0] === 2026 ? [{ team_id: "old-team", athlete_id: "42", name: "Example Guard", games: 30, minutes: 900 }] : []
              : sql.includes("FROM bb_team_season")
                ? [{ team_id: "old-team", team_name: "Old U" }, { team_id: "new-team", team_name: "New U" }]
                : [],
        }),
        first: async () => ({ receipt_json: JSON.stringify({ url: "https://release.test/rosters.parquet", fetched_at: "2026-09-10T00:00:00Z", sha256: "abc" }) }),
      }),
    }));
    const response = await basketballRosters.request("/?season=2027", {}, { RESEARCH_DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json() as { players: Array<Record<string, unknown>>; team_summaries: Array<Record<string, unknown>>; source: Record<string, unknown> };
    expect(body.players).toEqual([expect.objectContaining({ id: "42", name: "Example Guard", status: "different_program", previous_teams: ["Old U"] })]);
    expect(body.team_summaries).toEqual([expect.objectContaining({ team_id: "new-team", transfer_players: 1, incoming_prior_minutes: 900 })]);
    expect(body.source).toMatchObject({ fetched_at: "2026-09-10T00:00:00Z", sha256: "abc" });
  });

  it("rejects invalid seasons before touching D1", async () => {
    const prepare = vi.fn();
    expect((await basketballRosters.request("/?season=2024", {}, { RESEARCH_DB: { prepare } })).status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });
});
