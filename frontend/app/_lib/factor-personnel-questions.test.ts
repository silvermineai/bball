import { describe, expect, it } from "vitest";
import { briefFactors, type PressurePoint } from "./matchup-brief";
import type { ScoutPlayer } from "./scouting-types";
import { buildFactorPersonnelQuestions } from "./factor-personnel-questions";

const player = (id: string, overrides: Partial<ScoutPlayer> = {}): ScoutPlayer => ({
  id,
  team_id: "offense",
  name: id,
  position: "G",
  team: "Offense",
  season: 2026,
  games: 30,
  minutes: 900,
  mpg: 30,
  ppg: 12,
  rpg: 3,
  apg: 4,
  spg: 1,
  bpg: 0,
  topg: 2,
  efg: 0.55,
  ts: 0.58,
  three_pct: 0.36,
  ft_pct: 0.8,
  ft_rate: 0.2,
  three_rate: 0.4,
  tov_rate: 0.14,
  qualified: true,
  incomplete_box_games: 0,
  orpg: 1,
  usage_est: 0.2,
  ...overrides,
});

const pressure = (key: PressurePoint["factor"]["key"]): PressurePoint => ({
  factor: briefFactors.find((factor) => factor.key === key)!,
  offense: "Offense",
  defense: "Defense",
  offensive: { value: 0.6, games: 20, percentile: 90, rank: 1, population: 100 },
  defensive: { value: 0.4, games: 20, percentile: 10, rank: 100, population: 100 },
  contrast: 80,
  category: "Test",
});

describe("factor personnel questions", () => {
  it("selects the highest recorded lead with exact identity and preserves a player handoff", () => {
    const rows = buildFactorPersonnelQuestions(
      [pressure("efg")],
      [{ profile: { id: "offense", name: "Offense", season: 2026 }, personnel: [player("low", { efg: 0.5 }), player("high", { efg: 0.62 })] }],
    );
    expect(rows[0]).toMatchObject({ player: { id: "high" }, metricText: "62.0%", sampleText: "30 games · 900 minutes" });
    expect(rows[0].playerHref).toContain("id=high");
    expect(rows[0].question).toContain("Defense's effective fg% profile");
  });

  it("withholds missing metrics, wrong team rows, and unsupported program names", () => {
    expect(buildFactorPersonnelQuestions([pressure("orb")], [{ profile: { id: "offense", name: "Offense", season: 2026 }, personnel: [player("wrong", { team_id: "other", orpg: 5 }), player("missing", { orpg: null })] }])).toEqual([]);
    expect(buildFactorPersonnelQuestions([pressure("ftr")], [])).toEqual([]);
  });
});
