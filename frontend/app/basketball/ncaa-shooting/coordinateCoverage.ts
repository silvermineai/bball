export type CoordinateCoverageStats = {
  attempts?: number | null;
  coordinate_count?: number | null;
  located_count?: number | null;
};

const count = (value: number | null | undefined) => (
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null
);

/** Format validated x/y points against the recorded attempt total. */
export function coordinateCoverage(stats: CoordinateCoverageStats) {
  const located = count(stats.located_count);
  const attempts = count(stats.attempts);
  if (located === null && attempts === null) return "—";
  return `${located === null ? "—" : located.toLocaleString()} / ${attempts === null ? "—" : attempts.toLocaleString()}`;
}
