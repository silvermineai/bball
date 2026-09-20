import type { BBTeam } from "./basketball-types";

export type TeamFactorKey =
  | "adj_off_efg"
  | "adj_def_efg"
  | "adj_off_tov"
  | "adj_def_tov"
  | "adj_off_orb"
  | "adj_def_orb"
  | "adj_off_ftr"
  | "adj_def_ftr";

export type TeamFactorDefinition = {
  key: TeamFactorKey;
  label: string;
  shortLabel: string;
  higherIsBetter: boolean;
};

export const teamFactorDefinitions: TeamFactorDefinition[] = [
  { key: "adj_off_efg", label: "Adjusted eFG% offense", shortLabel: "O eFG%", higherIsBetter: true },
  { key: "adj_def_efg", label: "Adjusted eFG% defense", shortLabel: "D eFG%", higherIsBetter: false },
  { key: "adj_off_tov", label: "Adjusted turnover offense", shortLabel: "O TO%", higherIsBetter: false },
  { key: "adj_def_tov", label: "Adjusted turnover defense", shortLabel: "D TO%", higherIsBetter: false },
  { key: "adj_off_orb", label: "Adjusted offensive rebounding", shortLabel: "O ORB%", higherIsBetter: true },
  { key: "adj_def_orb", label: "Adjusted defensive rebounding", shortLabel: "D ORB%", higherIsBetter: false },
  { key: "adj_off_ftr", label: "Adjusted free-throw rate offense", shortLabel: "O FTR", higherIsBetter: true },
  { key: "adj_def_ftr", label: "Adjusted free-throw rate defense", shortLabel: "D FTR", higherIsBetter: false },
];

export type RankedTeamFactor = {
  team: BBTeam;
  value: number;
  rank: number;
  population: number;
  percentile: number;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function teamFactorDefinition(key: TeamFactorKey): TeamFactorDefinition {
  return teamFactorDefinitions.find((definition) => definition.key === key) || teamFactorDefinitions[0];
}

export function rankTeamFactorRows(teams: BBTeam[], key: TeamFactorKey): RankedTeamFactor[] {
  const definition = teamFactorDefinition(key);
  const sorted = teams
    .map((team) => ({ team, value: team[key] }))
    .filter((row): row is { team: BBTeam; value: number } => finite(row.value))
    .sort((left, right) => (definition.higherIsBetter ? right.value - left.value : left.value - right.value) || left.team.rank - right.team.rank || left.team.name.localeCompare(right.team.name));
  return sorted.map((row) => {
    const prior = sorted.findIndex((candidate) => candidate.value === row.value);
    const rank = prior + 1;
    const percentile = sorted.length <= 1 ? 100 : Math.max(0, Math.min(100, 100 * (sorted.length - rank) / (sorted.length - 1)));
    return { ...row, rank, population: sorted.length, percentile };
  });
}
