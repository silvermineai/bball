export type LowerFootballDivision = "d2" | "d3";

export type LowerFootballResult = {
  game_id: string;
  kickoff: string;
  week: number | null;
  scope_division: LowerFootballDivision;
  home_id: string;
  home_name: string;
  home_division: string | null;
  away_id: string;
  away_name: string;
  away_division: string | null;
  home_score: number | null;
  away_score: number | null;
  neutral: boolean;
  score_complete: boolean;
};

export type LowerFootballTeam = {
  team_id: string;
  team: string;
  division: LowerFootballDivision;
  games: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
};

export type LowerFootballResults = {
  schema_version: number;
  sport: "football";
  season: number;
  generated_at: string;
  scope: string;
  coverage: Record<LowerFootballDivision, { games: number; score_complete: number; scores_missing: number }>;
  teams: Record<LowerFootballDivision, LowerFootballTeam[]>;
  rows: LowerFootballResult[];
  limitations: string[];
  source?: { dataset?: string; season?: number; url?: string; fetched_at?: string; sha256?: string; last_modified?: string | null };
};

const divisions = new Set<LowerFootballDivision>(["d2", "d3"]);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function validRow(value: unknown): value is LowerFootballResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.game_id === "string"
    && typeof row.kickoff === "string"
    && divisions.has(row.scope_division as LowerFootballDivision)
    && typeof row.home_id === "string"
    && typeof row.home_name === "string"
    && typeof row.away_id === "string"
    && typeof row.away_name === "string"
    && typeof row.score_complete === "boolean"
    && (!row.score_complete || (finite(row.home_score) != null && finite(row.away_score) != null))
    && (row.home_score == null || finite(row.home_score) != null)
    && (row.away_score == null || finite(row.away_score) != null);
}

/** Validate the checked-in archive and fail closed on malformed rows. */
export function validateLowerFootballResults(value: unknown): LowerFootballResults {
  if (!value || typeof value !== "object") throw new Error("Lower-division football archive is malformed.");
  const raw = value as Record<string, unknown>;
  if (raw.sport !== "football" || raw.schema_version !== 1 || typeof raw.season !== "number") {
    throw new Error("Lower-division football archive has an unsupported edition.");
  }
  const rows = Array.isArray(raw.rows) ? raw.rows.filter(validRow) : [];
  const teams = { d2: [], d3: [] } as Record<LowerFootballDivision, LowerFootballTeam[]>;
  for (const division of ["d2", "d3"] as const) {
    const source = raw.teams && typeof raw.teams === "object" ? (raw.teams as Record<string, unknown>)[division] : [];
    teams[division] = Array.isArray(source) ? source.filter((team): team is LowerFootballTeam => {
      if (!team || typeof team !== "object") return false;
      const row = team as Record<string, unknown>;
      return typeof row.team_id === "string" && typeof row.team === "string" && row.division === division
        && ["games", "wins", "losses", "points_for", "points_against"].every((key) => finite(row[key]) != null);
    }) : [];
  }
  const coverage = { d2: { games: 0, score_complete: 0, scores_missing: 0 }, d3: { games: 0, score_complete: 0, scores_missing: 0 } } as LowerFootballResults["coverage"];
  for (const row of rows) {
    coverage[row.scope_division].games += 1;
    coverage[row.scope_division][row.score_complete ? "score_complete" : "scores_missing"] += 1;
  }
  return {
    schema_version: 1,
    sport: "football",
    season: raw.season,
    generated_at: typeof raw.generated_at === "string" ? raw.generated_at : "",
    scope: typeof raw.scope === "string" ? raw.scope : "D2/D3 completed schedule results",
    coverage,
    teams,
    rows: rows.sort((a, b) => b.kickoff.localeCompare(a.kickoff) || b.game_id.localeCompare(a.game_id)),
    limitations: Array.isArray(raw.limitations) ? raw.limitations.filter((item): item is string => typeof item === "string") : [],
    source: raw.source && typeof raw.source === "object" ? raw.source as LowerFootballResults["source"] : undefined,
  };
}

export function lowerResultsForDivision(archive: LowerFootballResults, division: LowerFootballDivision) {
  return archive.rows.filter((row) => row.scope_division === division);
}
