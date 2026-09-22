import { describe, expect, it } from "vitest";
import { comparisonGateStateLabel, marketComparisonReadinessChecklist } from "./market-comparison-readiness";

describe("market comparison readiness checklist", () => {
  it("keeps an empty basketball capture from looking comparison-ready", () => {
    const gates = marketComparisonReadinessChecklist({
      capture: "capture_blocked",
      activeModel: {
        state: "no_capture",
        model_id: "basketball-model-2027",
        retained_observations: 0,
        settled_comparisons: 0,
        pending_comparisons: 0,
      },
      readiness: {
        retained_observations: 0,
        selected_game_observations: 0,
        outside_selected_cohort: 0,
        eligible_observations: 0,
        comparable_observations: 0,
        superseded_observations: 0,
        selected_comparisons: 0,
        rejection_counts: {},
      },
    });
    expect(gates.map(({ key, state }) => [key, state])).toEqual([
      ["capture", "blocked"],
      ["model", "ready"],
      ["pregame", "waiting"],
      ["values", "waiting"],
      ["selection", "waiting"],
      ["settlement", "waiting"],
    ]);
    expect(gates[0].detail).toContain("no quote availability is inferred");
    expect(gates.every((gate) => gate.state !== "ready" || gate.key === "model")).toBe(true);
  });

  it("separates a comparable pending quote from settled performance", () => {
    const gates = marketComparisonReadinessChecklist({
      capture: "validated",
      activeModel: {
        state: "pending_settlement",
        model_id: "model-live",
        retained_observations: 4,
        settled_comparisons: 0,
        pending_comparisons: 2,
      },
      readiness: {
        retained_observations: 4,
        selected_game_observations: 4,
        outside_selected_cohort: 0,
        eligible_observations: 4,
        comparable_observations: 4,
        superseded_observations: 0,
        selected_comparisons: 2,
        rejection_counts: {},
      },
    });
    expect(gates[0].state).toBe("ready");
    expect(gates[2].state).toBe("ready");
    expect(gates[4].state).toBe("ready");
    expect(gates[5]).toMatchObject({ state: "waiting", detail: expect.stringContaining("await a verified final") });
  });

  it("uses plain state labels", () => {
    expect(comparisonGateStateLabel("ready")).toBe("Ready");
    expect(comparisonGateStateLabel("blocked")).toBe("Blocked");
    expect(comparisonGateStateLabel("waiting")).toBe("Waiting");
  });
});
