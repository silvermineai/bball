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

export type PossessionValidation = {
  total: number;
  valid_estimate_games: number;
  missing_box_games?: number;
  missing_team_box_rows?: number;
  duplicate_team_box_keys?: number;
  negative_field_games?: number;
  impossible_shooting_games?: number;
  nonpositive_possession_games?: number;
  invalid_period_games?: number;
  outlier_pace_games?: number;
  score_mismatch_games?: number;
};

export type PossessionReadiness = {
  total: number;
  usable: number;
  withheld: number;
  usableShare: number | null;
  reviewFlags: number;
};

/** Turn raw D1 guards into a readable denominator without changing inputs. */
export function summarizePossessionReadiness(
  validation: PossessionValidation,
): PossessionReadiness {
  const total = Math.max(0, Number(validation.total) || 0);
  const usable = Math.min(
    total,
    Math.max(0, Number(validation.valid_estimate_games) || 0),
  );
  const reviewFields = [
    validation.missing_box_games,
    validation.missing_team_box_rows,
    validation.duplicate_team_box_keys,
    validation.negative_field_games,
    validation.impossible_shooting_games,
    validation.nonpositive_possession_games,
    validation.invalid_period_games,
    validation.outlier_pace_games,
    validation.score_mismatch_games,
  ];
  let reviewFlags = 0;
  for (const value of reviewFields) {
    reviewFlags += Math.max(0, Number(value) || 0);
  }
  return {
    total,
    usable,
    withheld: Math.max(0, total - usable),
    usableShare: total ? usable / total : null,
    reviewFlags,
  };
}

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
