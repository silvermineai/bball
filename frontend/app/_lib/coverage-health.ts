export type SourceReceipt = {
  dataset: string;
  source_count: number;
  latest_source_at: string | null;
};

export type SourceClockAudit = {
  latestAt: string | null;
  stale: string[];
  missing: string[];
};

/**
 * Audit every source dataset independently. A recent receipt for one release
 * must not hide a stale or missing clock for another release.
 */
export function auditSourceClocks(
  receipts: SourceReceipt[],
  now = Date.now(),
  staleAfterHours = 168,
): SourceClockAudit {
  const latest = receipts
    .map((receipt) => receipt.latest_source_at)
    .filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
    .sort();
  const stale: string[] = [];
  const missing: string[] = [];
  for (const receipt of receipts) {
    if (!receipt.latest_source_at || !Number.isFinite(Date.parse(receipt.latest_source_at))) {
      missing.push(receipt.dataset);
      continue;
    }
    const ageHours = Math.max(0, (now - Date.parse(receipt.latest_source_at)) / 3_600_000);
    if (ageHours > staleAfterHours) stale.push(receipt.dataset);
  }
  return {
    latestAt: latest.at(-1) ?? null,
    stale: stale.sort(),
    missing: missing.sort(),
  };
}
