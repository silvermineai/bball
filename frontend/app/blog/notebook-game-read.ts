import type {
  BBFactorKey,
  BBGame,
  BBRosterScenario,
  BBTeam,
} from "../_lib/basketball-types";

export type NotebookGameReadRow = {
  key: "range" | "factor" | "tempo" | "roster";
  label: string;
  finding: string;
  evidence: string;
  question: string;
};

const factorLabels: Record<BBFactorKey, string> = {
  efg: "effective field-goal rate",
  tov: "turnover rate",
  orb: "offensive rebound rate",
  ftr: "free-throw attempt rate",
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const signed = (value: number, digits = 1) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

/**
 * Turn the stored matchup evidence into a short reading order. This helper
 * does not estimate a new outcome: every row is arithmetic over the exact
 * forecast, factor, rating or roster-scenario records already on the page.
 * Invalid and mismatched inputs are withheld rather than narrated.
 */
export function buildNotebookGameRead(
  game: BBGame,
  homeTeam?: BBTeam | null,
  awayTeam?: BBTeam | null,
  rosterScenario?: BBRosterScenario | null,
  primaryModelId?: string | null,
): NotebookGameReadRow[] {
  const prediction = game.prediction || game.fallback_prediction;
  if (
    !prediction ||
    ![
      prediction.home_margin,
      prediction.home_win_probability,
      prediction.margin_low,
      prediction.margin_high,
      prediction.pace,
    ].every(finite) ||
    prediction.home_win_probability < 0 ||
    prediction.home_win_probability > 1 ||
    prediction.margin_low > prediction.margin_high ||
    prediction.home_margin < prediction.margin_low ||
    prediction.home_margin > prediction.margin_high ||
    prediction.pace <= 0
  ) {
    return [];
  }

  const rows: NotebookGameReadRow[] = [];
  const projectedSide =
    prediction.home_margin > 0
      ? game.home_name
      : prediction.home_margin < 0
        ? game.away_name
        : "Neither team";
  const baselineDescription =
    prediction.home_margin === 0
      ? "The baseline margin is even"
      : `${projectedSide} is the baseline side by ${Math.abs(prediction.home_margin).toFixed(1)} points`;
  const crossesZero =
    prediction.margin_low <= 0 && prediction.margin_high >= 0;
  rows.push({
    key: "range",
    label: "Start with the range",
    finding: crossesZero
      ? "Both teams remain inside the 80% margin range"
      : `${projectedSide} stays ahead across the 80% margin range`,
    evidence: `${baselineDescription}; the stored home-margin range is ${signed(prediction.margin_low)} to ${signed(prediction.margin_high)}.`,
    question: crossesZero
      ? "Which early matchup signal would make you update away from the baseline?"
      : "What evidence would have to break for the other team to move outside this one-sided range?",
  });

  const strongestFactor = (Object.entries(game.matchup_factors?.edges || {}) as Array<
    [BBFactorKey, number]
  >)
    .filter(
      ([key, value]) =>
        ["efg", "tov", "orb", "ftr"].includes(key) && finite(value),
    )
    .sort(
      (a, b) =>
        Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]),
    )[0];
  if (strongestFactor) {
    const [key, edge] = strongestFactor;
    const side = edge >= 0 ? game.home_name : game.away_name;
    rows.push({
      key: "factor",
      label: "Find the pressure point",
      finding: `${side} owns the largest stored factor edge`,
      evidence: `${factorLabels[key]} · ${Math.abs(edge * 100).toFixed(1)} percentage points toward ${side}.`,
      question: `Which actions and lineups are creating that ${factorLabels[key]} edge, and does it hold against the expected rotation?`,
    });
  }

  if (
    homeTeam?.id === game.home_id &&
    awayTeam?.id === game.away_id &&
    finite(homeTeam.adj_tempo) &&
    finite(awayTeam.adj_tempo) &&
    homeTeam.adj_tempo > 0 &&
    awayTeam.adj_tempo > 0
  ) {
    const midpoint = (homeTeam.adj_tempo + awayTeam.adj_tempo) / 2;
    const difference = prediction.pace - midpoint;
    rows.push({
      key: "tempo",
      label: "Check the possession count",
      finding: `${prediction.pace.toFixed(1)} projected possessions`,
      evidence: `${signed(difference)} versus the two teams’ ${(midpoint).toFixed(1)}-possession historical tempo midpoint.`,
      question:
        difference >= 0
          ? "Which team benefits if the game reaches that faster projected count, and how will it create the extra trips?"
          : "Which team can keep the game near that lower projected count, and what stops transition opportunities?",
    });
  }

  if (
    rosterScenario?.game_id === game.id &&
    rosterScenario.home_id === game.home_id &&
    rosterScenario.away_id === game.away_id &&
    typeof rosterScenario.primary_model_id === "string" &&
    rosterScenario.primary_model_id === primaryModelId?.trim() &&
    [
      rosterScenario.base_margin,
      rosterScenario.roster_margin,
      rosterScenario.margin_delta,
    ].every(finite) &&
    Math.abs(rosterScenario.base_margin - prediction.home_margin) <= 0.25 &&
    Math.abs(
      rosterScenario.roster_margin -
        rosterScenario.base_margin -
        rosterScenario.margin_delta,
    ) <= 0.01
  ) {
    const baselineSign = Math.sign(rosterScenario.base_margin);
    const rosterSign = Math.sign(rosterScenario.roster_margin);
    const changesSide =
      baselineSign !== 0 && rosterSign !== 0 && baselineSign !== rosterSign;
    const direction =
      rosterScenario.margin_delta > 0
        ? game.home_name
        : rosterScenario.margin_delta < 0
          ? game.away_name
          : "neither team";
    rows.push({
      key: "roster",
      label: "Test roster sensitivity",
      finding: changesSide
        ? "The research roster lens changes the projected side"
        : rosterScenario.margin_delta === 0
          ? "The roster lens leaves the projected margin unchanged"
          : `${Math.abs(rosterScenario.margin_delta).toFixed(1)}-point movement toward ${direction}`,
      evidence: `Baseline ${signed(rosterScenario.base_margin)} home · roster lens ${signed(rosterScenario.roster_margin)} home.`,
      question:
        "Which source-listed players account for that movement, and is there dated evidence for their current availability and role?",
    });
  }

  return rows;
}
