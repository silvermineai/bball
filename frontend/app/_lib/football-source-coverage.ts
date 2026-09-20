export type FootballSourceDataset = {
  dataset: string;
  rows: number | null;
};

export type FootballSourceCoverageRow = FootballSourceDataset & {
  label: string;
  count_status: "exact" | "deferred";
};

/**
 * Keep the source archive's coverage display truthful when the edge API falls
 * back to receipt-only metadata. A deferred count is different from zero and
 * must remain visible as such.
 */
export function footballSourceCoverageRows(
  datasets: FootballSourceDataset[] | null | undefined,
  labels: Record<string, string> | null | undefined,
): FootballSourceCoverageRow[] {
  const seen = new Set<string>();
  return (datasets || []).flatMap((dataset) => {
    const key = String(dataset.dataset || "").trim();
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const rows = Number.isInteger(dataset.rows) && (dataset.rows as number) >= 0
      ? dataset.rows
      : null;
    return [{
      dataset: key,
      rows,
      label: labels?.[key] || key.replaceAll("_", " "),
      count_status: rows == null ? "deferred" : "exact",
    }];
  });
}
