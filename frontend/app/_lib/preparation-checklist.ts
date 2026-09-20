export type PreparationChecklistInput = {
  pressureLabels: string[];
  shotPrepCount: number;
  factorPersonnelCount: number;
  forecastType: "primary" | "cold_start";
  marginLow: number;
  marginHigh: number;
};

/**
 * Turn evidence already present in a matchup brief into actions a staff can
 * check off. The wording stays grounded in evidence counts and forecast
 * uncertainty; it does not invent a rotation or claim a historical sample is
 * a current matchup result.
 */
export function buildPreparationChecklist(input: PreparationChecklistInput): string[] {
  const tasks = input.pressureLabels.map(
    (label) => `Review the ${label.toLowerCase()} pressure point on film and name the coverage response.`,
  );
  if (input.shotPrepCount > 0) {
    tasks.push(
      `Verify ${input.shotPrepCount} exact-ID shot-profile assignment${input.shotPrepCount === 1 ? "" : "s"} against current availability and role.`,
    );
  }
  if (input.factorPersonnelCount > 0) {
    tasks.push(
      `Assign a defender and fallback coverage for ${input.factorPersonnelCount} personnel-to-factor prompt${input.factorPersonnelCount === 1 ? "" : "s"}.`,
    );
  }
  tasks.push("Confirm current availability and the expected rotation with dated school evidence.");
  if (input.forecastType === "cold_start") {
    tasks.push("Stress-test the cold-start estimate with a conservative rotation and pace scenario.");
  } else if (input.marginLow <= 0 && input.marginHigh >= 0) {
    tasks.push("Build a one-possession plan for either result because the model range crosses zero.");
  } else {
    tasks.push("Define the counter if the model-favored team loses the first six minutes.");
  }
  tasks.push("Check the forecast record and capture time before using a market comparison.");
  return tasks;
}
