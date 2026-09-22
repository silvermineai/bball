import type { MarketReadinessState } from "./market-readiness";
import type { ModelMarketComparisonScope, SportSummary } from "./research-types";

export type ComparisonGateState = "ready" | "waiting" | "blocked";

export type ComparisonGate = {
  key: "capture" | "model" | "pregame" | "values" | "selection" | "settlement";
  label: string;
  state: ComparisonGateState;
  detail: string;
};

type ComparisonReadinessInput = {
  capture: MarketReadinessState;
  activeModel: ModelMarketComparisonScope;
  readiness?: SportSummary["comparison_readiness"];
};

function count(value: number | undefined): number {
  return Number.isInteger(value) && (value || 0) >= 0 ? value || 0 : 0;
}

/**
 * Turn the scorecard's separate integrity counters into a compact checklist.
 * A gate is never marked ready from a model estimate or a retained archive
 * row alone: each state comes from the server's explicit capture/comparison
 * evidence.
 */
export function marketComparisonReadinessChecklist(input: ComparisonReadinessInput): ComparisonGate[] {
  const capture: ComparisonGate = input.capture === "validated"
    ? { key: "capture", label: "Capture receipt", state: "ready", detail: "At least one capture retained a timing-validated quote." }
    : input.capture === "capture_blocked" || input.capture === "captured_rejected"
      ? { key: "capture", label: "Capture receipt", state: "blocked", detail: input.capture === "capture_blocked" ? "Source policy prevented a request; no quote availability is inferred." : "The captured quotes failed exact-game or timing checks." }
      : { key: "capture", label: "Capture receipt", state: "waiting", detail: input.capture === "captured_no_quotes" ? "A capture ran without a validated quote." : "A validated quote capture has not been recorded." };

  const model: ComparisonGate = input.activeModel.model_id && !["checking", "unavailable", "no_active_edition"].includes(input.activeModel.state)
    ? { key: "model", label: "Active model edition", state: "ready", detail: `Forecast edition ${input.activeModel.model_id} is identified.` }
    : input.activeModel.state === "no_active_edition"
      ? { key: "model", label: "Active model edition", state: "blocked", detail: "The retained market rows do not belong to the verified active forecast edition." }
      : { key: "model", label: "Active model edition", state: "waiting", detail: "The active forecast edition is still being verified." };

  const eligible = count(input.readiness?.eligible_observations);
  const comparable = count(input.readiness?.comparable_observations);
  const selected = count(input.readiness?.selected_comparisons);
  const retained = count(input.readiness?.retained_observations);
  const pregame: ComparisonGate = eligible > 0
    ? { key: "pregame", label: "Pregame identity and clock", state: "ready", detail: `${eligible.toLocaleString()} retained quote${eligible === 1 ? "" : "s"} passed the participant, kickoff, and freshness gates.` }
    : retained > 0
      ? { key: "pregame", label: "Pregame identity and clock", state: "blocked", detail: "Retained market rows exist, but none passed the pregame identity and freshness gates." }
      : { key: "pregame", label: "Pregame identity and clock", state: "waiting", detail: "No retained quote has reached the pregame identity and freshness gates." };
  const values: ComparisonGate = comparable > 0
    ? { key: "values", label: "Model and line values", state: "ready", detail: `${comparable.toLocaleString()} quote${comparable === 1 ? "" : "s"} contain the model and market values required for comparison.` }
    : eligible > 0
      ? { key: "values", label: "Model and line values", state: "blocked", detail: "Pregame quotes exist, but none contain a complete comparable model and line value." }
      : { key: "values", label: "Model and line values", state: "waiting", detail: "Waiting for a quote that passes the pregame gate." };
  const settlement: ComparisonGate = input.activeModel.settled_comparisons > 0
    ? { key: "settlement", label: "Verified final", state: "ready", detail: `${input.activeModel.settled_comparisons.toLocaleString()} active-edition comparison${input.activeModel.settled_comparisons === 1 ? "" : "s"} has a verified final.` }
    : input.activeModel.pending_comparisons > 0
      ? { key: "settlement", label: "Verified final", state: "waiting", detail: `${input.activeModel.pending_comparisons.toLocaleString()} active-edition comparison${input.activeModel.pending_comparisons === 1 ? "" : "s"} await a verified final.` }
      : { key: "settlement", label: "Verified final", state: "waiting", detail: "No active-edition comparison has a verified final yet." };
  const comparison: ComparisonGate = selected > 0
    ? { key: "selection", label: "Selected comparison", state: "ready", detail: `${selected.toLocaleString()} quote${selected === 1 ? "" : "s"} remain after provider, bookmaker, and market selection.` }
    : comparable > 0
      ? { key: "selection", label: "Selected comparison", state: "blocked", detail: "Comparable values exist, but no quote survived provider, bookmaker, and market selection." }
      : { key: "selection", label: "Selected comparison", state: "waiting", detail: "Waiting for a comparable quote." };

  // Keep the value and selection checks distinct. Selection is the final
  // pre-settlement gate and is labeled separately in the UI.
  return [capture, model, pregame, values, comparison, settlement];
}

export function comparisonGateStateLabel(state: ComparisonGateState): string {
  return state === "ready" ? "Ready" : state === "blocked" ? "Blocked" : "Waiting";
}
