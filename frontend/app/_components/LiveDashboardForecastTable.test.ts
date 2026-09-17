import { describe, expect, it } from "vitest";
import { sortForecastBoard } from "./LiveDashboardForecastTable";
import type { BBGame } from "../_lib/basketball-types";

const game = (id: string, starts_at: string, home_margin: number, home_win_probability: number): BBGame => ({
  id,
  season: 2027,
  starts_at,
  home_id: `home-${id}`,
  away_id: `away-${id}`,
  home_name: `Home ${id}`,
  away_name: `Away ${id}`,
  neutral: 0,
  time_tbd: 0,
  venue: "",
  broadcast: "",
  prediction: {
    home_score: 75,
    away_score: 70,
    home_margin,
    total: 145,
    pace: 68,
    home_win_probability,
    margin_low: home_margin - 8,
    margin_high: home_margin + 8,
  },
});

describe("sortForecastBoard", () => {
  const games = [
    game("late", "2026-11-10T04:00:00Z", 3, 0.58),
    game("early", "2026-11-01T04:00:00Z", 12, 0.91),
    game("middle", "2026-11-05T04:00:00Z", -8, 0.75),
  ];

  it("orders by tip time by default", () => {
    expect(sortForecastBoard(games, "start").map((row) => row.id)).toEqual(["early", "middle", "late"]);
  });

  it("orders confidence and absolute margin from highest to lowest", () => {
    expect(sortForecastBoard(games, "confidence").map((row) => row.id)).toEqual(["early", "middle", "late"]);
    expect(sortForecastBoard(games, "margin").map((row) => row.id)).toEqual(["early", "middle", "late"]);
  });
});
