import type { BBDatasetCoverage } from "./basketball-types";

export type CoverageReceiptState = "recorded" | "derived" | "missing" | "incomplete";

export function dashboardCoverageRows(datasets: BBDatasetCoverage[] | undefined) {
  return [...(datasets || [])]
    .filter((dataset) => Number.isFinite(dataset.rows) && dataset.rows > 0)
    .sort((a, b) => b.rows - a.rows || a.label.localeCompare(b.label));
}

export function coverageReceiptState(dataset: Pick<BBDatasetCoverage, "source_count" | "latest_source_at" | "identity_note">): CoverageReceiptState {
  const countRecorded = Number.isInteger(dataset.source_count) && dataset.source_count > 0;
  const timestampRecorded = Boolean(dataset.latest_source_at && Number.isFinite(Date.parse(dataset.latest_source_at)));
  if (countRecorded && timestampRecorded) return "recorded";
  if (!countRecorded && !dataset.latest_source_at) {
    return /^derived from\b/i.test(dataset.identity_note.trim()) ? "derived" : "missing";
  }
  return "incomplete";
}
