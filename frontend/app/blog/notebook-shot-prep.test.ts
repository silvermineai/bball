import { describe, expect, it } from "vitest";
import type { ShotOption } from "../_lib/shooting";
import type { ScoutPlayer } from "../_lib/scouting-types";
import { buildNotebookShotPrep } from "./notebook-shot-prep";

const player = (id: string, teamId = "home"): ScoutPlayer => ({
  id,
  team_id: teamId,
  name: `Player ${id}`,
  position: "G",
  team: "Home State",
  season: 2026,
  games: 30,
  minutes: 900,
  mpg: 30,
  starts: 20,
  starter_reported_records: 30,
  starter_rate: 2 / 3,
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
});

const profile = (overrides: Partial<ShotOption> = {}): ShotOption => ({
  id: "p1",
  name: "Player p1",
  teams: ["home"],
  all: { attempts: 200, made: 100, threes: 120, threes_made: 45, located: 0 },
  matched: { attempts: 180, made: 90, threes: 110, threes_made: 42, located: 150 },
  box_games: 30,
  ...overrides,
});

describe("notebook shot preparation", () => {
  it("creates an exact-ID map link and denominator-backed question", () => {
    const [row] = buildNotebookShotPrep("home", [player("p1")], [profile()], 2026);
    expect(row.mapHref).toBe("/basketball/shooting/?player=p1&team=home&season=2026");
    expect(row.evidence).toContain("180 matched attempts");
    expect(row.question).toContain("60% of recorded attempts are threes");
  });

  it("withholds a profile joined to the wrong team or with impossible counts", () => {
    expect(buildNotebookShotPrep("away", [player("p1")], [profile()], 2026)).toEqual([]);
    expect(
      buildNotebookShotPrep(
        "home",
        [player("p1")],
        [profile({ matched: { attempts: 180, made: 90, threes: 110, threes_made: 42, located: 181 } })],
        2026,
      ),
    ).toEqual([]);
  });

  it("reports sparse coordinate coverage instead of treating it as a complete map", () => {
    const [row] = buildNotebookShotPrep(
      "home",
      [player("p1")],
      [profile({ matched: { attempts: 180, made: 90, threes: 110, threes_made: 42, located: 40 } })],
      2026,
    );
    expect(row.question).toContain("22% of the matched attempts have coordinates");
  });
});
