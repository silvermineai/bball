import type { BBFactorKey, BBGame } from "../../_lib/basketball-types";
import { matchupFactorStudyQuestion } from "../../_lib/forecast-lab-analysis";

export const upcomingFactorMeta: ReadonlyArray<{ key: BBFactorKey; label: string }> = [
  { key: "efg", label: "Shot quality" },
  { key: "tov", label: "Ball security" },
  { key: "orb", label: "Second chances" },
  { key: "ftr", label: "Free-throw pressure" },
];

export type UpcomingFactorStudyRow = {
  key: BBFactorKey;
  label: string;
  edge: number | null;
  homeOffense: number | null;
  homeDefense: number | null;
  awayOffense: number | null;
  awayDefense: number | null;
  question: string;
};

export type UpcomingFactorStudy = {
  lineage: "same-edition" | "other-edition" | "unavailable";
  season: number | null;
  modelId: string | null;
  rows: UpcomingFactorStudyRow[];
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Shape the retained Four Factor context for the learning page without
 * filling gaps. A row can be partially populated because source coverage is
 * field-level; each rate and edge therefore remains independently nullable.
 */
export function buildUpcomingFactorStudy(
  game: Pick<BBGame, "matchup_factors" | "matchup_factors_model_id" | "matchup_factors_same_edition">,
): UpcomingFactorStudy {
  const factors = game.matchup_factors;
  const season = factors && Number.isInteger(factors.season) ? factors.season : null;
  const rows = upcomingFactorMeta.map(({ key, label }) => {
    const values = factors?.factors[key];
    const edge = factors?.edges[key];
    return {
      key,
      label,
      edge: finite(edge) ? edge : null,
      homeOffense: finite(values?.home_offense) ? values.home_offense : null,
      homeDefense: finite(values?.home_defense) ? values.home_defense : null,
      awayOffense: finite(values?.away_offense) ? values.away_offense : null,
      awayDefense: finite(values?.away_defense) ? values.away_defense : null,
      question: matchupFactorStudyQuestion(key),
    };
  });
  return {
    lineage: !factors
      ? "unavailable"
      : game.matchup_factors_same_edition === false
        ? "other-edition"
        : "same-edition",
    season,
    modelId: game.matchup_factors_model_id || null,
    rows,
  };
}
