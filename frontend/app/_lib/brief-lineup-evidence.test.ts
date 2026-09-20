import { describe, expect, it } from "vitest";
import type { MatchupStintEdition } from "./matchup-stints";
import { buildBriefLineupEvidence } from "./brief-lineup-evidence";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "pair-1",
  season: 2026,
  home: "Home State",
  away: "Away Tech",
  home_lineup: ["H1", "H2", "H3", "H4", "H5"],
  away_lineup: ["A1", "A2", "A3", "A4", "A5"],
  home_lineup_key: "home-key",
  away_lineup_key: "away-key",
  games: 2,
  stints: 4,
  duration_mins: 18.5,
  events: 100,
  possessions: 80,
  home_points: 40,
  away_points: 36,
  net_per_100: 5,
  home_per_100: 50,
  away_per_100: 45,
  last_date: "03/01/2026",
  ...overrides,
});

const edition = (matchups: unknown[]): MatchupStintEdition => ({
  season: 2026,
  generated_at: "2026-09-19T00:00:00Z",
  coverage: {
    source_rows: 1,
    source_contests: 1,
    source_matchups: matchups.length,
    source_possessions: 80,
    published_matchups: matchups.length,
    truncated: false,
  },
  matchups: matchups as MatchupStintEdition["matchups"],
});

describe("brief lineup evidence", () => {
  it("orients exact team rows and orders the highest possession samples first", () => {
    expect(buildBriefLineupEvidence(edition([]), [])).toEqual([]);
    const rows = buildBriefLineupEvidence(
      edition([row({ id: "small", possessions: 20 }), row({ id: "large", possessions: 120 })]),
      ["Home State", "Away Tech"],
      1,
    );
    expect(rows[0].rows[0]).toMatchObject({ team: "Home State", opponent: "Away Tech", possessions: 120, sourceId: "large" });
    expect(rows[1].rows[0]).toMatchObject({ team: "Away Tech", opponent: "Home State", lineup: ["A1", "A2", "A3", "A4", "A5"] });
  });

  it("does not fuzzy match names and withholds malformed or wrong-season rows", () => {
    const rows = buildBriefLineupEvidence(
      edition([
        row({ id: "wrong-season", season: 2025 }),
        row({ id: "bad-lineup", home_lineup: ["H1"] }),
        row({ id: "valid" }),
      ]),
      ["Home", "Home State"],
    );
    expect(rows[0].rows).toEqual([]);
    expect(rows[1].rows).toHaveLength(1);
    expect(rows[1].rows[0].sourceId).toBe("valid");
  });
});
