import { describe, expect, it } from "vitest";
import type {
  BBGame,
  BBRosterScenario,
  BBTeam,
} from "../_lib/basketball-types";
import { buildNotebookGameRead } from "./notebook-game-read";

const team = (id: string, tempo: number): BBTeam => ({
  id,
  name: id,
  rank: 1,
  adj_off: 115,
  adj_def: 95,
  adj_net: 20,
  adj_tempo: tempo,
  games: 30,
  wins: 24,
  expected_wins: null,
  luck: null,
  luck_games: 0,
  sos: null,
  sos_games: 0,
  efg: null,
  tov_rate: null,
  orb_rate: null,
  ft_rate: null,
  three_rate: null,
});

const game = (): BBGame => ({
  id: "401",
  season: 2027,
  starts_at: "2026-11-02T20:00:00Z",
  home_id: "home",
  away_id: "away",
  home_name: "Home State",
  away_name: "Away Tech",
  neutral: 0,
  time_tbd: 0,
  venue: "Arena",
  broadcast: "",
  prediction: {
    home_score: 75,
    away_score: 72,
    home_margin: 3,
    total: 147,
    pace: 70,
    home_win_probability: 0.61,
    margin_low: -8,
    margin_high: 14,
  },
  matchup_factors: {
    season: 2026,
    factors: {},
    edges: { efg: 0.012, tov: -0.038, orb: Number.NaN },
  },
});

const scenario = (): BBRosterScenario => ({
  game_id: "401",
  home_id: "home",
  away_id: "away",
  primary_model_id: "model-1",
  base_margin: 3,
  roster_margin: -1,
  margin_delta: -4,
  home_predicted_net: 4,
  away_predicted_net: 5,
  roster_home_win_probability: 0.47,
  roster_margin_low: -12,
  roster_margin_high: 10,
});

describe("basketball notebook game read", () => {
  it("builds a compact reading order only from stored matchup evidence", () => {
    const rows = buildNotebookGameRead(
      game(),
      team("home", 68),
      team("away", 66),
      scenario(),
      "model-1",
    );

    expect(rows.map((row) => row.key)).toEqual([
      "range",
      "factor",
      "tempo",
      "roster",
    ]);
    expect(rows[0].finding).toContain("Both teams");
    expect(rows[1].finding).toContain("Away Tech");
    expect(rows[1].evidence).toContain("3.8 percentage points");
    expect(rows[2].evidence).toContain("+3.0");
    expect(rows[3].finding).toContain("changes the projected side");
  });

  it("labels a one-sided calibrated interval without inventing certainty", () => {
    const oneSided = game();
    oneSided.prediction = {
      ...oneSided.prediction!,
      home_margin: 9,
      margin_low: 1,
      margin_high: 18,
    };

    expect(buildNotebookGameRead(oneSided)[0]).toMatchObject({
      key: "range",
      finding: "Home State stays ahead across the 80% margin range",
    });
  });

  it("withholds team and roster readings when exact identities do not match", () => {
    const mismatchedScenario = { ...scenario(), game_id: "other" };
    const rows = buildNotebookGameRead(
      game(),
      team("other-home", 68),
      team("away", 66),
      mismatchedScenario,
      "model-1",
    );

    expect(rows.map((row) => row.key)).toEqual(["range", "factor"]);
  });

  it("withholds the complete guide when the stored forecast is impossible", () => {
    const invalid = game();
    invalid.prediction = {
      ...invalid.prediction!,
      home_win_probability: 1.2,
    };

    expect(buildNotebookGameRead(invalid)).toEqual([]);
  });

  it("withholds an internally inconsistent roster scenario", () => {
    const invalid = { ...scenario(), margin_delta: 2 };
    expect(
      buildNotebookGameRead(
        game(),
        team("home", 68),
        team("away", 66),
        invalid,
        "model-1",
      ).map((row) => row.key),
    ).toEqual(["range", "factor", "tempo"]);
  });

  it("withholds a roster scenario from a different forecast edition", () => {
    expect(
      buildNotebookGameRead(
        game(),
        team("home", 68),
        team("away", 66),
        scenario(),
        "model-2",
      ).map((row) => row.key),
    ).toEqual(["range", "factor", "tempo"]);
  });
});
