import { describe, expect, it } from "vitest";
import type { ScoutPlayer } from "../_lib/scouting-types";
import { notebookPersonnelWatch } from "./notebook-personnel-watch";

const player = (id: string, patch: Partial<ScoutPlayer> = {}): ScoutPlayer => ({
  id,
  team_id: "home",
  name: `Player ${id}`,
  position: "G",
  team: "Home State",
  season: 2026,
  games: 30,
  minutes: id === "lead" ? 900 : 500,
  mpg: 30,
  ppg: 14,
  rpg: 3,
  apg: 4,
  spg: 1,
  bpg: 0.2,
  topg: 2,
  efg: 0.55,
  ts: 0.58,
  three_pct: 0.38,
  ft_pct: 0.8,
  ft_rate: 0.2,
  three_rate: 0.5,
  tov_rate: 0.12,
  qualified: true,
  incomplete_box_games: 0,
  ...patch,
});

describe("notebook personnel watch", () => {
  it("surfaces only denominator-backed role signals for the highest-workload players", () => {
    const [row] = notebookPersonnelWatch([
      player("secondary"),
      player("lead", {
        usage_est: 0.27,
        usage_games: 30,
        minutes_share: 0.31,
        assist_turnover_ratio: 2.4,
        assist_turnover_games: 29,
        three_attempts: 184,
        three_attempt_games: 30,
      }),
    ]);

    expect(row.player.id).toBe("lead");
    expect(row.signals.map((signal) => signal.label)).toEqual([
      "Usage",
      "Team minutes",
      "A/TO",
      "3PA",
    ]);
    expect(row.signals[0].value).toBe("27.0%");
    expect(row.signals[3].question).toContain("closeout");
  });

  it("does not turn missing or unusable denominators into role claims", () => {
    const [row] = notebookPersonnelWatch([
      player("lead", {
        usage_est: 0.27,
        usage_games: 0,
        minutes_share: 1.4,
        assist_turnover_ratio: 2.4,
        assist_turnover_games: 0,
        three_attempts: -1,
        three_attempt_games: 30,
      }),
    ]);

    expect(row.signals).toEqual([]);
  });

  it("orders by recorded minutes and honors a valid limit", () => {
    const rows = notebookPersonnelWatch([
      player("a"),
      player("b", { minutes: 700 }),
      player("c", { minutes: 600 }),
    ], 2);
    expect(rows.map((row) => row.player.id)).toEqual(["b", "c"]);
    expect(notebookPersonnelWatch([player("a")], 0)).toEqual([]);
  });
});
