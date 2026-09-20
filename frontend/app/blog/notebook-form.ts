import type { Metric, ScoutProfile, Split } from "../_lib/scouting-types";

export const notebookFormMetrics = [
  { key: "off_eff", label: "Offensive efficiency", format: "number" },
  { key: "def_eff", label: "Defensive efficiency", format: "number" },
  { key: "off_efg", label: "Effective FG%", format: "percent" },
  { key: "off_tov", label: "Turnover rate", format: "percent" },
  { key: "off_orb", label: "Offensive rebound rate", format: "percent" },
  { key: "off_ftr", label: "Free-throw attempt rate", format: "percent" },
] as const;

export type NotebookFormMetricKey = (typeof notebookFormMetrics)[number]["key"];
export type NotebookFormSample = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pace: number | null;
  metrics: Record<NotebookFormMetricKey, number | null>;
};
export type NotebookRecentForm = {
  sourceEdition: string;
  generatedAt: string;
  modelId: string;
  home: { id: string; name: string; season: NotebookFormSample; lastFive: NotebookFormSample };
  away: { id: string; name: string; season: NotebookFormSample; lastFive: NotebookFormSample };
};

const finiteOrNull = (value: number | null | undefined) => value == null || Number.isFinite(value);
const validCount = (value: number) => Number.isInteger(value) && value >= 0;

function sample(split: Split | null | undefined, maximumGames: number | null): NotebookFormSample | null {
  if (
    !split
    || !split.metrics
    || !validCount(split.games)
    || (maximumGames != null && split.games > maximumGames)
    || !validCount(split.wins)
    || !validCount(split.losses)
    || !validCount(split.ties)
    || split.wins + split.losses + split.ties > split.games
    || !finiteOrNull(split.pace)
  ) return null;
  const metrics = {} as Record<NotebookFormMetricKey, number | null>;
  for (const definition of notebookFormMetrics) {
    const metric = split.metrics[definition.key] as Metric | undefined;
    if (!metric || !finiteOrNull(metric.value) || !validCount(metric.games) || metric.games > split.games) return null;
    metrics[definition.key] = metric.value;
  }
  return { games: split.games, wins: split.wins, losses: split.losses, ties: split.ties, pace: split.pace, metrics };
}

/**
 * Compare season and last-five observations only when both exact team profiles
 * share one reproducible scouting edition and model identity.
 */
export function notebookRecentForm(
  home: ScoutProfile | null | undefined,
  away: ScoutProfile | null | undefined,
  homeId: string,
  awayId: string,
): NotebookRecentForm | null {
  if (
    !home
    || !away
    || home.id !== homeId
    || away.id !== awayId
    || typeof home.source_edition !== "string"
    || typeof away.source_edition !== "string"
    || !home.source_edition.trim()
    || home.source_edition !== away.source_edition
    || typeof home.generated_at !== "string"
    || typeof away.generated_at !== "string"
    || !home.generated_at.trim()
    || home.generated_at !== away.generated_at
    || typeof home.model_id !== "string"
    || typeof away.model_id !== "string"
    || !home.model_id.trim()
    || home.model_id !== away.model_id
    || home.season !== away.season
  ) return null;
  const homeSeason = sample(home.splits.season, null);
  const homeLastFive = sample(home.splits.last5, 5);
  const awaySeason = sample(away.splits.season, null);
  const awayLastFive = sample(away.splits.last5, 5);
  if (!homeSeason || !homeLastFive || !awaySeason || !awayLastFive) return null;
  if (homeLastFive.games > homeSeason.games || awayLastFive.games > awaySeason.games) return null;
  return {
    sourceEdition: home.source_edition,
    generatedAt: home.generated_at,
    modelId: home.model_id,
    home: { id: home.id, name: home.name, season: homeSeason, lastFive: homeLastFive },
    away: { id: away.id, name: away.name, season: awaySeason, lastFive: awayLastFive },
  };
}
