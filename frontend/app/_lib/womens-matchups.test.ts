import { describe, expect, it } from "vitest";
import { filterWomensMatchups, mergeWomensMatchups, pageWomensMatchups, sortWomensMatchups, type WomensForecastRow } from "./womens-matchups";

const forecasts: WomensForecastRow[] = [
  { game_id: "1", date: "2026-11-02T05:00Z", away: "A", home: "North", prediction: { home_win_probability: 0.8, predicted_margin: 12, predicted_home_score: 75, predicted_away_score: 63, margin_low: -2, margin_high: 26, estimate_type: "primary" } },
  { game_id: "2", date: "2026-12-03T05:00Z", away: "B", home: "South", prediction: { home_win_probability: 0.55, predicted_margin: 1, predicted_home_score: 70, predicted_away_score: 69, margin_low: -15, margin_high: 17, estimate_type: "cold_start" } },
  { game_id: "3", date: "2026-12-04T05:00Z", away: "C", home: "North", prediction: null },
];

describe("women's matchup slate", () => {
  it("joins schedule context by exact game ID", () => {
    const rows = mergeWomensMatchups(forecasts, [{ game_id: "1", venue: "Arena" }, { game_id: "999", venue: "Other" }]);
    expect(rows[0].schedule?.venue).toBe("Arena");
    expect(rows[1].schedule).toBeUndefined();
  });

  it("filters by month, team search, and model coverage without substituting rows", () => {
    const rows = mergeWomensMatchups(forecasts, []);
    expect(filterWomensMatchups(rows, { month: "2026-12", query: "south", coverage: "cold-start" }).map((row) => row.game_id)).toEqual(["2"]);
    expect(filterWomensMatchups(rows, { coverage: "unavailable" }).map((row) => row.game_id)).toEqual(["3"]);
  });

  it("keeps an explicit unknown estimate type out of the primary bucket", () => {
    const rows = mergeWomensMatchups([
      { game_id: "4", date: "2026-12-05T05:00Z", away: "D", home: "East", prediction: { home_win_probability: 0.7, predicted_margin: 8, predicted_home_score: 74, predicted_away_score: 66, estimate_type: "experimental_v9" } },
    ], []);
    expect(filterWomensMatchups(rows, { coverage: "primary" })).toEqual([]);
    expect(filterWomensMatchups(rows, { coverage: "unavailable" }).map((row) => row.game_id)).toEqual(["4"]);
  });

  it("sorts by confidence and keeps page boundaries deterministic", () => {
    const rows = sortWomensMatchups(mergeWomensMatchups(forecasts, []), "confidence");
    expect(rows.map((row) => row.game_id)).toEqual(["1", "2", "3"]);
    expect(pageWomensMatchups(rows, 1, 2).map((row) => row.game_id)).toEqual(["3"]);
  });
});
