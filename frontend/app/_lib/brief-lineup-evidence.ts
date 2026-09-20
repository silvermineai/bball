import type { MatchupStint, MatchupStintEdition } from "./matchup-stints";

export type BriefLineupEvidenceRow = {
  team: string;
  opponent: string;
  lineup: string[];
  opposingLineup: string[];
  possessions: number;
  games: number;
  durationMins: number;
  netPer100: number | null;
  lastDate: string | null;
  sourceId: string;
};

export type BriefLineupEvidence = {
  team: string;
  rows: BriefLineupEvidenceRow[];
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const validLineup = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length === 5 && value.every((name) => typeof name === "string" && name.trim().length > 0);

function validMatchup(row: MatchupStint, season: number): boolean {
  return (
    row.season === season &&
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.home === "string" &&
    typeof row.away === "string" &&
    validLineup(row.home_lineup) &&
    validLineup(row.away_lineup) &&
    Number.isInteger(row.games) &&
    row.games > 0 &&
    Number.isInteger(row.possessions) &&
    row.possessions > 0 &&
    finite(row.duration_mins) &&
    row.duration_mins > 0 &&
    (row.net_per_100 == null || finite(row.net_per_100))
  );
}

/**
 * Select source-native five-v-five evidence for each exact program name. This
 * is a historical film queue, not a current rotation or a head-to-head
 * forecast. The archive does not expose a universal player identity graph, so
 * names remain source-native and no fuzzy joins are attempted.
 */
export function buildBriefLineupEvidence(
  edition: MatchupStintEdition,
  teamNames: string[],
  limit = 3,
): BriefLineupEvidence[] {
  if (!Number.isInteger(edition.season) || edition.season <= 0 || !Array.isArray(edition.matchups)) return [];
  const teams = [...new Set(teamNames.map((name) => name.trim()).filter(Boolean))];
  return teams.map((team) => {
    const rows = edition.matchups
      .filter((row) => validMatchup(row, edition.season))
      .flatMap((row) => {
        if (row.home === team) {
          return [{ team, opponent: row.away, lineup: row.home_lineup, opposingLineup: row.away_lineup, row }];
        }
        if (row.away === team) {
          return [{ team, opponent: row.home, lineup: row.away_lineup, opposingLineup: row.home_lineup, row }];
        }
        return [];
      })
      .sort((a, b) => b.row.possessions - a.row.possessions || b.row.games - a.row.games || a.row.id.localeCompare(b.row.id))
      .slice(0, Math.max(0, limit))
      .map(({ team: matchedTeam, opponent, lineup, opposingLineup, row }) => ({
        team: matchedTeam,
        opponent,
        lineup: [...lineup],
        opposingLineup: [...opposingLineup],
        possessions: row.possessions,
        games: row.games,
        durationMins: row.duration_mins,
        netPer100: row.net_per_100,
        lastDate: row.last_date,
        sourceId: row.id,
      }));
    return { team, rows };
  });
}
