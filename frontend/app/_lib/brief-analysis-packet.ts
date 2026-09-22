import type { BBPrediction } from "./basketball-types";
import type { BriefRosterReadiness } from "./matchup-brief";

export type BriefPacketState = "verified" | "partial" | "unavailable" | "blocked";

export type BriefPacketItem = {
  key: "forecast" | "total_uncertainty" | "model_terms" | "schedule" | "matchup_context" | "roster" | "availability" | "market";
  label: string;
  state: BriefPacketState;
  observed: string;
  missing: string;
};

export type BriefAnalysisPacket = {
  state: "ready" | "partial" | "blocked";
  verifiedCount: number;
  items: BriefPacketItem[];
  missingInputs: string[];
};

type AvailabilityEvidence = {
  state: Exclude<BriefPacketState, "blocked">;
  observed: string;
  missing: string;
};

type BriefAnalysisPacketArgs = {
  prediction: Pick<
    BBPrediction,
    | "home_score"
    | "away_score"
    | "home_margin"
    | "total"
    | "pace"
    | "home_win_probability"
    | "margin_low"
    | "margin_high"
    | "total_low"
    | "total_high"
    | "total_half_width"
  > & { estimate_type?: BBPrediction["estimate_type"] };
  modelId: string | null | undefined;
  /** The live row's exact model ID, when hydration has attached one. */
  forecastModelId?: string | null;
  coefficientReproduced: boolean;
  startsAt: string;
  timeTbd: number | boolean;
  venue?: string | null;
  neutral: number | boolean;
  factorCount: number;
  roster: Pick<BriefRosterReadiness, "state" | "label">;
  marketQuoteCount: number;
  /** No availability feed is passed by the current model, so callers must say so explicitly. */
  availability?: AvailabilityEvidence;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const positiveCount = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0;

function item(
  key: BriefPacketItem["key"],
  label: string,
  state: BriefPacketState,
  observed: string,
  missing: string,
): BriefPacketItem {
  return { key, label, state, observed, missing };
}

/**
 * Build the evidence boundary for one published matchup brief.
 *
 * A roster listing is kept descriptive, and an absent quote or availability
 * feed is never converted into a neutral or positive claim. Any conflict with
 * an attached forecast edition blocks the packet so a stale row cannot look
 * ready for preparation.
 */
export function buildBriefAnalysisPacket(args: BriefAnalysisPacketArgs): BriefAnalysisPacket {
  const numbers = [
    args.prediction.home_score,
    args.prediction.away_score,
    args.prediction.home_margin,
    args.prediction.total,
    args.prediction.pace,
    args.prediction.home_win_probability,
    args.prediction.margin_low,
    args.prediction.margin_high,
  ];
  const predictionValid = numbers.every(finite)
    && args.prediction.home_win_probability >= 0
    && args.prediction.home_win_probability <= 1
    && args.prediction.margin_low <= args.prediction.margin_high;
  const totalIntervalPresent = [args.prediction.total_low, args.prediction.total_high, args.prediction.total_half_width]
    .some((value) => value != null);
  const totalIntervalValid = finite(args.prediction.total_low)
    && finite(args.prediction.total_high)
    && finite(args.prediction.total_half_width)
    && args.prediction.total_half_width > 0
    && args.prediction.total_low <= args.prediction.total
    && args.prediction.total <= args.prediction.total_high
    && Math.abs((args.prediction.total - args.prediction.total_low) - args.prediction.total_half_width) <= 0.05
    && Math.abs((args.prediction.total_high - args.prediction.total) - args.prediction.total_half_width) <= 0.05;
  const modelId = typeof args.modelId === "string" && args.modelId.trim() ? args.modelId.trim() : null;
  const attachedModelId = args.forecastModelId == null
    ? null
    : typeof args.forecastModelId === "string" && args.forecastModelId.trim()
      ? args.forecastModelId.trim()
      : "";
  const modelConflict = attachedModelId !== null && attachedModelId !== "" && modelId !== attachedModelId;

  const forecast = !predictionValid
    ? item(
        "forecast",
        "Model forecast",
        "blocked",
        "Forecast withheld",
        "Finite scores, margin, total, interval and win probability from one valid row",
      )
    : modelConflict
      ? item(
          "forecast",
          "Model forecast",
          "blocked",
          `Attached edition ${attachedModelId} conflicts with ${modelId || "the published model"}`,
          "One immutable model edition for the forecast and its evidence",
        )
      : !modelId
        ? item(
            "forecast",
            "Model forecast",
            "blocked",
            "Forecast model identity unavailable",
            "A registered model ID before this estimate is used",
          )
        : attachedModelId === null
          ? item(
              "forecast",
              "Model forecast",
              "partial",
              `${args.prediction.estimate_type === "cold_start" ? "Cold-start" : "Published"} estimate · model ${modelId}`,
              "Per-game model ID attachment; the static snapshot only carries the overview edition",
            )
          : item(
              "forecast",
              "Model forecast",
              "verified",
              `${args.prediction.estimate_type === "cold_start" ? "Cold-start" : "Published"} estimate · model ${modelId}`,
              "",
            );

  const modelTerms = args.coefficientReproduced
    ? item("model_terms", "Model terms", "verified", "Coefficient terms reproduce the published score", "")
    : item(
        "model_terms",
        "Model terms",
        "unavailable",
        "Coefficient archive does not reproduce this forecast edition",
        "Matching coefficient terms before attributing the estimate to inputs",
      );

  const totalUncertainty = !totalIntervalPresent
    ? item(
        "total_uncertainty",
        "Total uncertainty",
        "unavailable",
        "No independent total range is published for this model edition",
        "A calibrated total range before using the projected total for scenario planning",
      )
    : !totalIntervalValid
      ? item(
          "total_uncertainty",
          "Total uncertainty",
          "blocked",
          "Published total range failed its integrity checks",
          "A finite, ordered total range centered on the forecast total",
        )
      : item(
          "total_uncertainty",
          "Total uncertainty",
          "verified",
          `Calibrated total range ${args.prediction.total_low} to ${args.prediction.total_high} points`,
          "",
        );

  const startsAt = Date.parse(args.startsAt);
  const schedule = !Number.isFinite(startsAt)
    ? item("schedule", "Schedule", "blocked", "Start timestamp is invalid", "A parseable source schedule timestamp")
    : Boolean(args.timeTbd)
      ? item(
          "schedule",
          "Schedule",
          "partial",
          "Date retained; tip time is unconfirmed",
          "Confirmed start time before final pre-tip planning",
        )
      : item(
          "schedule",
          "Schedule",
          "verified",
          `${Boolean(args.neutral) ? "Neutral floor" : "Home/away floor"}${args.venue ? ` · ${args.venue}` : ""}`,
          "",
        );

  const context = !positiveCount(args.factorCount)
    ? item("matchup_context", "Historical matchup context", "blocked", "Factor count is invalid", "A valid count of qualifying historical factor contrasts")
    : args.factorCount > 0
      ? item(
          "matchup_context",
          "Historical matchup context",
          "verified",
          `${args.factorCount} qualifying Four Factor contrast${args.factorCount === 1 ? "" : "s"}`,
          "",
        )
      : item(
          "matchup_context",
          "Historical matchup context",
          "unavailable",
          "No factor contrast met the minimum evidence thresholds",
          "At least one historical factor pair with valid games, ranks and rates",
        );

  const rosterState = args.roster.state;
  const roster = rosterState === "complete"
    ? item("roster", "Roster evidence", "verified", args.roster.label, "")
    : rosterState === "partial"
      ? item("roster", "Roster evidence", "partial", args.roster.label, "Source roster rows for both teams before continuity is compared")
      : rosterState === "missing"
        ? item("roster", "Roster evidence", "unavailable", args.roster.label, "Source roster rows for both teams")
        : item("roster", "Roster evidence", "blocked", "Roster state is invalid", "A reconciled roster-readiness state")

  const availability = args.availability
    ? item("availability", "Current availability", args.availability.state, args.availability.observed, args.availability.missing)
    : item(
        "availability",
        "Current availability",
        "unavailable",
        "No current injury, eligibility or rotation feed is attached",
        "Confirmed player availability, eligibility and rotation status",
      );

  const market = !positiveCount(args.marketQuoteCount)
    ? item("market", "Verified market", "blocked", "Market quote count is invalid", "A reconciled count of exact-game, pregame quotes")
    : args.marketQuoteCount > 0
      ? item("market", "Verified market", "verified", `${args.marketQuoteCount} exact-game pregame quote${args.marketQuoteCount === 1 ? "" : "s"}`, "")
      : item("market", "Verified market", "unavailable", "No exact-game pregame quote survived the ledger checks", "A licensed quote matched to this game, model edition and pregame clock")

  const items = [forecast, totalUncertainty, modelTerms, schedule, context, roster, availability, market];
  const missingInputs = [...new Set(items.filter((entry) => entry.state !== "verified" && entry.missing).map((entry) => entry.missing))];
  const blocked = items.some((entry) => entry.state === "blocked");
  const state = blocked ? "blocked" : missingInputs.length ? "partial" : "ready";
  return {
    state,
    verifiedCount: items.filter((entry) => entry.state === "verified").length,
    items,
    missingInputs,
  };
}
