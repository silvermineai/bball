import { describe, expect, it } from "vitest";
import {
  forecastSignal,
  matchupFilterSearch,
  parseMatchupFilters,
  sortMatchups,
} from "./basketball-matchups";
import type { BBGame } from "./basketball-types";

const game = (
  id: string,
  starts_at: string,
  home_margin: number,
  probability: number,
  width = 20,
): BBGame => ({
  id,
  season: 2027,
  starts_at,
  home_id: `${id}h`,
  away_id: `${id}a`,
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
    home_win_probability: probability,
    margin_low: home_margin - width / 2,
    margin_high: home_margin + width / 2,
  },
});

describe("basketball matchup triage", () => {
  it("labels probability confidence without rounding it first", () => {
    expect(
      forecastSignal(game("a", "2026-11-01T00:00:00Z", 1, 0.59).prediction!),
    ).toMatchObject({ label: "Toss-up", confidence: 0.59 });
    expect(
      forecastSignal(game("b", "2026-11-01T00:00:00Z", 1, 0.62).prediction!).label,
    ).toBe("Lean");
    expect(
      forecastSignal(game("c", "2026-11-01T00:00:00Z", 1, 0.77).prediction!).label,
    ).toBe("Strong lean");
  });

  it("sorts closest games first and leaves unforecast games last", () => {
    const unforecasted = {
      ...game("u", "2026-10-01T00:00:00Z", 0, 0.5),
      prediction: null,
    };
    const rows = sortMatchups(
      [
        unforecasted,
        game("wide", "2026-10-02T00:00:00Z", 8, 0.7),
        game("close", "2026-10-03T00:00:00Z", -1, 0.51),
      ],
      "close",
    );
    expect(rows.map((row) => row.id)).toEqual(["close", "wide", "u"]);
  });

  it("keeps the default date view chronological across forecast coverage", () => {
    const unforecasted = {
      ...game("u", "2026-10-01T00:00:00Z", 0, 0.5),
      prediction: null,
    };
    const rows = sortMatchups(
      [game("later", "2026-10-03T00:00:00Z", 2, 0.55), unforecasted],
      "date",
    );
    expect(rows.map((row) => row.id)).toEqual(["u", "later"]);
  });

  it("sorts uncertainty by the published margin interval", () => {
    const rows = sortMatchups(
      [
        game("narrow", "2026-10-01T00:00:00Z", 4, 0.6, 12),
        game("wide", "2026-10-02T00:00:00Z", 4, 0.6, 30),
      ],
      "uncertainty",
    );
    expect(rows.map((row) => row.id)).toEqual(["wide", "narrow"]);
  });

  it("round-trips supported slate controls for a shareable view", () => {
    const filters = parseMatchupFilters(
      "?team=Kansas%20Jayhawks&month=2026-11&coverage=forecasted&sort=confidence",
    );
    expect(filters).toEqual({
      team: "Kansas Jayhawks",
      month: "2026-11",
      coverage: "forecasted",
      sort: "confidence",
      page: 0,
    });
    expect(matchupFilterSearch(filters)).toBe(
      "?team=Kansas+Jayhawks&month=2026-11&coverage=forecasted&sort=confidence",
    );
    expect(
      matchupFilterSearch({ team: "Kansas Jayhawks", month: "2026-11", coverage: "forecasted", sort: "confidence", page: 3 }),
    ).toBe("?team=Kansas+Jayhawks&month=2026-11&coverage=forecasted&sort=confidence&page=3");
  });

  it("withholds invalid controls and omits defaults", () => {
    expect(parseMatchupFilters("?month=tomorrow&coverage=maybe&sort=bad")).toEqual({
      team: "",
      month: "all",
      coverage: "all",
      sort: "date",
      page: 0,
    });
    expect(
      matchupFilterSearch({ team: "", month: "all", coverage: "all", sort: "date", page: 0 }),
    ).toBe("");
  });

  it("round-trips a bounded prep pick list", () => {
    const filters = parseMatchupFilters("?pick=game-a&pick=game-b&pick=game-a");
    expect(filters.picks).toEqual(["game-a", "game-b", "game-a"]);
    expect(matchupFilterSearch({
      team: "",
      month: "all",
      coverage: "all",
      sort: "date",
      page: 0,
      picks: filters.picks,
    })).toBe("?pick=game-a&pick=game-b&pick=game-a");
  });
});
