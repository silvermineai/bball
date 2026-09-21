export type DivisionTeam = {
  team_ncaa_id: number;
  division: 1 | 2 | 3;
  name: string;
  conference: string | null;
  games: number | null;
  wins: number | null;
  losses: number | null;
  ppg: number | null;
};

const finiteOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

function parseTeam(value: unknown): DivisionTeam | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = finiteOrNull(row.team_ncaa_id);
  const division = finiteOrNull(row.division);
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
  if (id == null || !Number.isInteger(id) || division == null || ![1, 2, 3].includes(division) || !name) return null;
  return {
    team_ncaa_id: id,
    division: division as 1 | 2 | 3,
    name,
    conference: typeof row.conference === "string" && row.conference.trim() ? row.conference.trim() : null,
    games: finiteOrNull(row.games),
    wins: finiteOrNull(row.wins),
    losses: finiteOrNull(row.losses),
    ppg: finiteOrNull(row.ppg),
  };
}

export function parseDivisionTeams(value: unknown): DivisionTeam[] {
  if (!value || typeof value !== "object") throw new Error("Team archive is not an object.");
  const rows = (value as { teams?: unknown }).teams;
  if (!Array.isArray(rows)) throw new Error("Team archive has no team rows.");
  const teams = rows.map(parseTeam);
  if (teams.some((team): team is null => team === null)) throw new Error("Team archive contains a malformed row.");
  const parsed = teams as DivisionTeam[];
  const ids = new Set(parsed.map((team) => team.team_ncaa_id));
  if (ids.size !== parsed.length) throw new Error("Team archive contains duplicate IDs.");
  return parsed;
}

export type DivisionTeamSort = "wins" | "win_rate" | "ppg" | "name";

export const divisionTeamArchiveExportHeaders = [
  "team_ncaa_id", "division", "name", "conference", "games", "wins", "losses", "ppg",
];

/** Export every retained team field from the already division-scoped rows. */
export function divisionTeamArchiveExport(
  teams: readonly DivisionTeam[],
): { headers: string[]; rows: Array<Array<string | number | null>> } {
  return {
    headers: divisionTeamArchiveExportHeaders,
    rows: teams.map((team) => [
      team.team_ncaa_id,
      team.division,
      team.name,
      team.conference,
      team.games,
      team.wins,
      team.losses,
      team.ppg,
    ]),
  };
}

export function filterDivisionTeams(
  teams: DivisionTeam[],
  division: "2" | "3",
  query: string,
  sort: DivisionTeamSort,
) {
  const needle = query.trim().toLowerCase();
  const rows = teams
    .filter((team) => String(team.division) === division)
    .filter((team) => !needle || `${team.name} ${team.conference || ""} ${team.team_ncaa_id}`.toLowerCase().includes(needle))
    .sort(teamComparator(sort));
  return rows;
}

function teamComparator(sort: DivisionTeamSort) {
  return (left: DivisionTeam, right: DivisionTeam) => {
    if (sort === "name") return left.name.localeCompare(right.name) || left.team_ncaa_id - right.team_ncaa_id;
    if (sort === "ppg") return (right.ppg ?? -Infinity) - (left.ppg ?? -Infinity) || left.name.localeCompare(right.name) || left.team_ncaa_id - right.team_ncaa_id;
    if (sort === "win_rate") {
      const leftRate = left.games && left.wins != null ? left.wins / left.games : -Infinity;
      const rightRate = right.games && right.wins != null ? right.wins / right.games : -Infinity;
      return rightRate - leftRate || left.name.localeCompare(right.name) || left.team_ncaa_id - right.team_ncaa_id;
    }
    return (right.wins ?? -Infinity) - (left.wins ?? -Infinity) || left.name.localeCompare(right.name) || left.team_ncaa_id - right.team_ncaa_id;
  };
}

export type RankedDivisionTeam = DivisionTeam & { rank: number };

/**
 * Assign a deterministic ordinal within the requested division before any
 * search filter is applied. The rank is a view order for the selected
 * recorded field, never an inferred strength rating or cross-division rank.
 * Missing values sort after recorded values, preserving unavailable fields.
 */
export function rankDivisionTeams(
  teams: readonly DivisionTeam[],
  division: "2" | "3",
  sort: DivisionTeamSort,
): RankedDivisionTeam[] {
  return teams
    .filter((team) => String(team.division) === division)
    .slice()
    .sort(teamComparator(sort))
    .map((team, index) => ({ ...team, rank: index + 1 }));
}
