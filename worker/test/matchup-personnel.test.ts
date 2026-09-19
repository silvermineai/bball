import { describe, expect, it, vi } from "vitest";
import { matchupPersonnel } from "../src/matchup-personnel";

function bindings({ missing = false, fail = false } = {}) {
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => {
        if (fail) throw new Error("busy");
        if (missing) return null;
        return {
          id: "401912207", season: 2027, starts_at: "2026-11-02T05:00:00Z",
          home_id: "2132", away_id: "44", home_name: "Cincinnati", away_name: "American", completed: 0,
        };
      },
      all: async () => {
        if (fail) throw new Error("busy");
        if (sql.includes("FROM bb_participation")) return { results: [
          { team_id: "2132", team_name: "Cincinnati", athlete_id: "10", name: "Return Guard", games: 30, minutes: 900 },
          { team_id: "99", team_name: "Prior College", athlete_id: "20", name: "Incoming Wing", games: 25, minutes: 700 },
        ] };
        if (sql.includes("FROM bb_player_season")) return { results: [
          { team_id: "2132", athlete_id: "10", stats_json: JSON.stringify({ averages: { avgPoints: { value: 14.2 }, avgRebounds: { value: 4.1 }, "avgFieldGoalsMade-avgFieldGoalsAttempted": { display: "5.0-11.0" } } }) },
          { team_id: "99", athlete_id: "20", stats_json: JSON.stringify({ averages: { avgPoints: { value: 10.5 }, avgAssists: { value: 2.1 } } }) },
        ] };
        if (sql.includes("FROM bb_player_value")) return { results: [
          { team_id: "2132", player_id: "10", stats_json: JSON.stringify({ box_bpm: 4.2, box_obpm: 3.1, box_dbpm: 1.1 }) },
          { team_id: "99", player_id: "20", stats_json: JSON.stringify({ box_bpm: 1.3 }) },
        ] };
        if (sql.includes("FROM bb_sources")) return { results: [{ dataset: "rosters", season: 2027, fetched_at: "2026-09-19T00:00:00Z", sha256: "a".repeat(64) }] };
        if (sql.startsWith("SELECT team_id,athlete_id,profile_json FROM bb_rosters")) return { results: [
          { team_id: "2132", athlete_id: "10", profile_json: JSON.stringify({ full_name: "Return Guard", position_abbreviation: "G", experience_display_value: "Sr.", height: "6-3" }) },
          { team_id: "44", athlete_id: "20", profile_json: JSON.stringify({ full_name: "Incoming Wing", position_abbreviation: "F" }) },
        ] };
        return { results: [] };
      },
    }),
  }));
  return { RESEARCH_DB: { prepare } } as unknown as Env;
}

describe("matchup personnel", () => {
  it("keeps exact prior-team stints and current-roster continuity status", async () => {
    const response = await matchupPersonnel.request("/?season=2027&gameId=401912207", {}, bindings());
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.coverage).toEqual({ listed_players: 2, players_with_prior_minutes: 2, players_with_publisher_stats: 2, players_with_box_bpm: 2 });
    expect(body.home.players[0]).toMatchObject({ athlete_id: "10", name: "Return Guard", status: "returning", prior_games: 30, prior_minutes: 900 });
    expect(body.home.players[0].prior_stints[0]).toMatchObject({ team_id: "2132", stats: { ppg: 14.2, rpg: 4.1, field_goals: "5.0-11.0" }, box_bpm: 4.2 });
    expect(body.away.players[0]).toMatchObject({ athlete_id: "20", status: "incoming", prior_stints: [{ team_id: "99", team: "Prior College", games: 25, minutes: 700 }] });
    expect(body.source_receipts[0]).not.toHaveProperty("url");
  });

  it("returns 404 for an exact game-season miss", async () => {
    const response = await matchupPersonnel.request("/?season=2027&gameId=401912207", {}, bindings({ missing: true }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Matchup not found for the requested season." });
  });

  it("rejects unsafe game identifiers before querying D1", async () => {
    const env = bindings();
    const response = await matchupPersonnel.request("/?season=2027&gameId=4019%20OR%201=1", {}, env);
    expect(response.status).toBe(400);
    expect(env.RESEARCH_DB.prepare).not.toHaveBeenCalled();
  });

  it("returns a bounded retryable error when D1 is busy", async () => {
    const response = await matchupPersonnel.request("/?season=2027&gameId=401912207", {}, bindings({ fail: true }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "The matchup personnel archive is temporarily unavailable." });
  });
});
