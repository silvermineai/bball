import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adjustedFactorPoints,
  briefEvidence,
  briefScenarioUrl,
  historicalPersonnel,
  pressurePoints,
} from "./matchup-brief";
import { basketballScenario } from "./basketball-scenario";
import { scenarioQuery, scenarioVenue } from "./scenario-location";
import type { BBOverview, BBRosters } from "./basketball-types";
import type { ScoutProfile } from "./scouting-types";
import type { RecruitingRelease } from "./recruiting";
import type { Ledger } from "./research-types";
const read = (path: string) =>
  JSON.parse(
    readFileSync(new URL("../../public/data/" + path, import.meta.url), "utf8"),
  );
const overview: BBOverview = read("basketball/overview.json"),
  rosters: BBRosters = read("basketball/rosters.json"),
  recruiting: RecruitingRelease = read("basketball/recruiting.json"),
  ledger: Ledger = read("research/ledger.json");
const profiles = new Map<string, ScoutProfile>(
  overview.ratings.map((t) => [t.id, read(`basketball/scouting/${t.id}.json`)]),
);
describe("matchup evidence and scenario handoff", () => {
  it("exposes complete schedule-adjusted factor lenses in both directions", () => {
    const game = overview.upcoming.find((g) => g.prediction)!;
    const home = profiles.get(game.home_id)!;
    const away = profiles.get(game.away_id)!;
    for (const [offense, defense] of [
      [away, home],
      [home, away],
    ] as const) {
      const points = adjustedFactorPoints(offense, defense);
      expect(points).toHaveLength(4);
      expect(points.every((point) => Number.isFinite(point.gap))).toBe(true);
      const turnover = points.find((point) => point.factor.key === "tov")!;
      expect(turnover.gap).toBeCloseTo(
        defense.rating.adj_def_tov! - offense.rating.adj_off_tov!,
        8,
      );
    }
    const incomplete = structuredClone(home);
    incomplete.rating.adj_def_efg = null;
    expect(adjustedFactorPoints(away, incomplete)).toHaveLength(3);
  });

  it("builds every published brief from matching editions and preserves venue forecasts", () => {
    let count = 0;
    for (const game of overview.upcoming.filter((g) => g.prediction)) {
      const home = profiles.get(game.home_id)!,
        away = profiles.get(game.away_id)!;
      const result = briefEvidence(
        game,
        overview,
        home,
        away,
        recruiting,
        ledger,
        rosters,
      );
      expect(result.pressures.length).toBeLessThanOrEqual(4);
      for (const program of result.programs) {
        expect(program.roster).not.toBeNull();
        expect(program.roster!.representedMinutes).toBeLessThanOrEqual(
          program.roster!.priorMinutes,
        );
        const shape = program.roster!.positionCounts;
        expect(shape.guard + shape.forward + shape.center + shape.unreported).toBe(
          program.roster!.listed,
        );
        for (const group of ["guard", "forward", "center"] as const) {
          const workload = program.roster!.positionWorkload[group];
          expect(workload.returningMinutes).toBeLessThanOrEqual(workload.priorMinutes);
          expect(workload.returningShare == null || workload.returningShare >= 0).toBe(true);
        }
      }
      for (const point of result.pressures) {
        expect(point.offensive.games).toBeGreaterThanOrEqual(10);
        expect(point.defensive.games).toBeGreaterThanOrEqual(10);
        const offense = point.offense === away.name ? away : home,
          defense = point.defense === home.name ? home : away;
        expect(point.offensive).toBe(
          offense.splits.season.metrics[`off_${point.factor.key}`],
        );
        expect(point.defensive).toBe(
          defense.splits.season.metrics[`def_${point.factor.key}`],
        );
      }
      const url = new URL(briefScenarioUrl(game), "https://example.test");
      const venue = scenarioVenue(url.searchParams.get("venue"));
      const predicted = basketballScenario(
        overview.model,
        url.searchParams.get("a")!,
        url.searchParams.get("b")!,
        venue === "neutral",
      )!;
      expect(predicted.home_score).toBeCloseTo(game.prediction!.home_score, 2);
      expect(predicted.home_win_probability).toBeCloseTo(
        game.prediction!.home_win_probability,
        5,
      );
      count++;
    }
    expect(count).toBe(overview.coverage.forecast_games);
  });
  it("rejects mixed profile editions and mismatched ledger snapshots", () => {
    const game = overview.upcoming.find((g) => g.prediction)!;
    const home = profiles.get(game.home_id)!,
      away = profiles.get(game.away_id)!;
    expect(() =>
      briefEvidence(
        game,
        overview,
        { ...home, model_id: "old" },
        away,
        recruiting,
        ledger,
      ),
    ).toThrow(/edition/);
    const versionRows = ledger.versions?.length ? ledger.versions : ledger.games;
    const original = versionRows.find(
      (r) => r.game_id === game.id && r.model_id === overview.model.id,
    )!;
    expect(original).toBeDefined();
    for (const patch of [
      { model_id: "old" },
      { home_margin: original.home_margin + 1 },
      { starts_at: "2000-01-01T00:00:00Z" },
      { home_name: "Wrong program" },
    ]) {
      const changed = {
        ...ledger,
        versions: versionRows.map((r) => (r.id === original.id ? { ...r, ...patch } : r)),
      };
      expect(
        briefEvidence(game, overview, home, away, recruiting, changed).ledger,
      ).toBeNull();
    }
    expect(
      briefEvidence(game, overview, home, away, recruiting, ledger).ledger?.id,
    ).toBe(original.id);
  });
  it("does not manufacture pressure points from missing or short samples", () => {
    const [first, second] = [...profiles.values()],
      profile = structuredClone(first);
    for (const value of Object.values(profile.splits.season.metrics)) {
      value.games = 9;
    }
    expect(pressurePoints(profile, second)).toHaveLength(0);
    for (const value of Object.values(profile.splits.season.metrics)) {
      value.games = 30;
      value.value = null;
    }
    expect(pressurePoints(profile, second)).toHaveLength(0);
    const empty = {
      ...first,
      players: first.players.map((p) => ({ ...p, minutes: 199 })),
    };
    expect(historicalPersonnel(empty)).toHaveLength(0);
  });
  it("keeps later availability statements and does not claim reviewed coverage for other schools", () => {
    const covered = overview.upcoming.find(
      (g) => g.prediction && (g.home_id === "130" || g.away_id === "130"),
    )!;
    const result = briefEvidence(
      covered,
      overview,
      profiles.get(covered.home_id)!,
      profiles.get(covered.away_id)!,
      recruiting,
      ledger,
      rosters,
    );
    const team = result.programs.find((p) => p.profile.id === "130")!;
    expect(team.reviewed).toBe(true);
    expect(team.announcements.some((p) => p.latest.kind !== "addition")).toBe(
      true,
    );
    const later = { ...recruiting, season: 2028 };
    const stale = briefEvidence(
      covered,
      overview,
      profiles.get(covered.home_id)!,
      profiles.get(covered.away_id)!,
      later,
      ledger,
      rosters,
    );
    expect(
      stale.programs.every((p) => !p.reviewed && !p.announcements.length),
    ).toBe(true);
  });
  it("round-trips the scenario floor and defaults invalid venues to neutral", () => {
    for (const venue of ["a", "b", "neutral"] as const) {
      const params = new URLSearchParams(scenarioQuery("150", "130", venue));
      expect(scenarioVenue(params.get("venue"))).toBe(venue);
    }
    expect(scenarioVenue("arbitrary")).toBe("neutral");
  });
});
