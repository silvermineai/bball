import type { WomensLowerDivisionStatistic } from "./womens-lower-division-integrity";
import { lowerDivisionGames } from "./womens-lower-division-view";

export type WomensLowerRankingRow = {
  rank: number | null;
  name: string;
  team: string;
  position: string;
  games: number | null;
  value: string;
  valueField: string;
  teamSourcePath: string;
  sourceFields: Record<string, unknown>;
};

const identityFields = new Set(["Rank", "Name", "Team", "Cl", "Height", "Position", "G"]);
const text = (value: unknown) => value == null ? "" : String(value).trim();
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

function valueField(statistic: WomensLowerDivisionStatistic): string {
  return [...statistic.headers].reverse().find((header) => !identityFields.has(header)) || statistic.headers.at(-1) || "Value";
}

export function womensLowerRankingRows(
  statistic: WomensLowerDivisionStatistic,
  query = "",
  minimumGames = 0,
): WomensLowerRankingRow[] {
  const needle = query.trim().toLowerCase();
  const minimum = Number.isFinite(minimumGames) && minimumGames > 0 ? minimumGames : 0;
  const field = valueField(statistic);
  return statistic.rows
    .map((row) => {
      const sourceFields: Record<string, unknown> = row.source_fields && typeof row.source_fields === "object" && !Array.isArray(row.source_fields)
        ? row.source_fields as Record<string, unknown>
        : {};
      const games = lowerDivisionGames(row);
      const rank = numeric(row.rank ?? sourceFields.Rank);
      const name = text(row.name ?? sourceFields.Name);
      const team = text(row.team ?? sourceFields.Team);
      return {
        rank: rank == null ? null : Math.trunc(rank),
        name,
        team,
        position: text(row.position ?? sourceFields.Position),
        games,
        value: text(sourceFields[field] ?? row[field]),
        valueField: field,
        teamSourcePath: text(row.team_source_path),
        sourceFields,
      } satisfies WomensLowerRankingRow;
    })
    .filter((row) => {
      if (minimum && (row.games == null || row.games < minimum)) return false;
      if (!needle) return true;
      return `${row.name} ${row.team} ${row.position} ${row.teamSourcePath}`.toLowerCase().includes(needle);
    })
    .sort((left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY)
      || left.name.localeCompare(right.name)
      || left.team.localeCompare(right.team));
}

export function womensLowerRankingValueLabel(statistic: WomensLowerDivisionStatistic): string {
  return valueField(statistic);
}
