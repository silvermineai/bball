import { describe, expect, it } from "vitest";
import { selectFootballBlogGames } from "./football-blog-index";
import type { Game } from "../../_lib/data";

const game = (id: string, kickoff: string, prediction: Game["prediction"]): Game => ({
  id, season: 2026, kickoff, home_id: `home-${id}`, away_id: `away-${id}`,
  home_name: "Home", away_name: "Away", home_conference: "Conference", away_conference: "Conference",
  home_division: "fbs", away_division: "fbs", week: 1, neutral: 0, venue: "Stadium", time_tbd: 0,
  prediction, market: null,
});
const prediction: Game["prediction"] = { home_margin: 3, total: 48, home_score: 26, away_score: 23, home_win_probability: 0.6, margin_low: -10, margin_high: 16 };

describe("football notebook queue", () => {
  it("keeps only forecasted rows and orders them by kickoff", () => {
    expect(selectFootballBlogGames([
      game("late", "2026-09-03T19:00:00Z", prediction),
      game("missing", "2026-09-01T19:00:00Z", null),
      game("early", "2026-09-01T18:00:00Z", prediction),
    ]).map((row) => row.id)).toEqual(["early", "late"]);
  });

  it("withholds malformed rows and honors a bounded queue", () => {
    expect(selectFootballBlogGames([game("", "not-a-date", prediction)])).toEqual([]);
    expect(selectFootballBlogGames([game("a", "2026-09-01T00:00:00Z", prediction)], 0)).toEqual([]);
  });
});
