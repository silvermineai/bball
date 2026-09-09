import { describe, expect, it, vi } from "vitest";
import { researchScorecard } from "../src/research-scorecard";

describe("live research scorecard", () => {
  it("returns the selected registration with parsed status and metrics", async () => {
    const selected = {
      id: "registration-1",
      sport: "basketball",
      game_id: "game-1",
      model_id: "model-1",
      generated_at: "2026-10-01T00:00:00.000000Z",
      registered_at: "2026-10-01T00:01:00.000000Z",
      starts_at: "2026-10-02T00:00:00.000000Z",
      time_tbd: 0,
      payload_json: JSON.stringify({
        home_id: "home",
        away_id: "away",
        home_name: "Home University",
        away_name: "Away College",
        season: 2027,
        prediction: { home_margin: 5, total: 145, home_win_probability: 0.7, margin_low: -8, margin_high: 18 },
      }),
      state_json: JSON.stringify({
        home_id: "home",
        away_id: "away",
        starts_at: "2026-10-02T00:00:00.000000Z",
        time_tbd: 0,
        completed: 0,
        home_score: null,
        away_score: null,
      }),
      exclusion: null,
    };
    const prepare = vi.fn((sql: string) => {
      const first = async () => {
        if (sql.includes("MAX(CAST")) return { season: 2027 };
        if (sql.includes("audit_predictions")) return { total: 1 };
        if (sql.includes("audit_markets") && sql.includes("WHERE sport=?")) return { total: 7 };
        if (sql.includes("audit_unmatched") && sql.includes("WHERE sport=?")) return { total: 3 };
        return { total: 0 };
      };
      return {
        first,
        bind: (..._args: unknown[]) => ({
          first,
          all: async () => sql.includes("ROW_NUMBER() OVER") ? { results: [selected] } : { results: [] },
        }),
      };
    });
    const response = await researchScorecard.request(
      "/?sport=basketball&season=2027&limit=5000",
      {},
      { RESEARCH_DB: { prepare } as never },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { live: boolean; total: number; market_observations: number; unmatched_events: number; games: Array<Record<string, unknown>>; sports: Record<string, Record<string, unknown>> };
    expect(body.live).toBe(true);
    expect(body.total).toBe(1);
    expect(body.market_observations).toBe(7);
    expect(body.unmatched_events).toBe(3);
    expect(body.games[0]).toMatchObject({ home_name: "Home University", status: "scheduled", home_margin: 5, home_win_probability: 0.7 });
    expect(body.sports.basketball).toMatchObject({ games: 1, registered_versions: 1, games_with_comparisons: 0 });
  });
});
