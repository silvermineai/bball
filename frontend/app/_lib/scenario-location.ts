export type ScenarioVenue = "neutral" | "a" | "b";
export function scenarioVenue(value: string | null): ScenarioVenue {
  return value === "a" || value === "b" ? value : "neutral";
}
export function scenarioQuery(a: string, b: string, venue: ScenarioVenue) {
  return new URLSearchParams({ a, b, venue }).toString();
}
