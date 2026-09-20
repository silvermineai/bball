export type FootballMarketBenchmarkRow = {
  actual_margin: number;
  actual_total: number;
  model_margin: number;
  model_total: number;
  archived_margin: number | null;
  archived_total: number | null;
};

export type PairedErrorRecord = {
  games: number;
  model_better: number;
  archive_better: number;
  ties: number;
  model_mae: number | null;
  archive_mae: number | null;
};

export type MarginDisagreementBand = PairedErrorRecord & {
  key: "under-3" | "3-to-7" | "7-plus";
  label: string;
};

export type MarginDisagreementDirection = PairedErrorRecord & {
  key: "model-above" | "model-below" | "same";
  label: string;
};

const average = (values: number[]) => values.length
  ? values.reduce((total, value) => total + value, 0) / values.length
  : null;

function pairedErrorRecord(
  rows: FootballMarketBenchmarkRow[],
  modelValue: (row: FootballMarketBenchmarkRow) => number,
  archiveValue: (row: FootballMarketBenchmarkRow) => number | null,
  actualValue: (row: FootballMarketBenchmarkRow) => number,
): PairedErrorRecord {
  const paired = rows.flatMap((row) => {
    const model = modelValue(row);
    const archive = archiveValue(row);
    const actual = actualValue(row);
    if (![model, archive, actual].every((value) => value != null && Number.isFinite(value))) return [];
    return [{ modelError: Math.abs(model - actual), archiveError: Math.abs(archive! - actual) }];
  });
  return {
    games: paired.length,
    model_better: paired.filter((row) => row.modelError < row.archiveError).length,
    archive_better: paired.filter((row) => row.archiveError < row.modelError).length,
    ties: paired.filter((row) => row.archiveError === row.modelError).length,
    model_mae: average(paired.map((row) => row.modelError)),
    archive_mae: average(paired.map((row) => row.archiveError)),
  };
}

/** Compare absolute forecast errors only where both estimates exist for the same final. */
export function pairedFootballMarketErrors(rows: FootballMarketBenchmarkRow[]) {
  return {
    margin: pairedErrorRecord(rows, (row) => row.model_margin, (row) => row.archived_margin, (row) => row.actual_margin),
    total: pairedErrorRecord(rows, (row) => row.model_total, (row) => row.archived_total, (row) => row.actual_total),
  };
}

/** Show whether larger model/line disagreements historically improved error, without treating them as wagers. */
export function marginDisagreementBands(rows: FootballMarketBenchmarkRow[]): MarginDisagreementBand[] {
  const bands = [
    { key: "under-3" as const, label: "Under 3 pts", matches: (gap: number) => gap < 3 },
    { key: "3-to-7" as const, label: "3–6.9 pts", matches: (gap: number) => gap >= 3 && gap < 7 },
    { key: "7-plus" as const, label: "7+ pts", matches: (gap: number) => gap >= 7 },
  ];
  return bands.map((band) => {
    const selected = rows.filter((row) => row.archived_margin != null
      && Number.isFinite(row.archived_margin)
      && Number.isFinite(row.model_margin)
      && band.matches(Math.abs(row.model_margin - row.archived_margin)));
    return { key: band.key, label: band.label, ...pairedErrorRecord(selected, (row) => row.model_margin, (row) => row.archived_margin, (row) => row.actual_margin) };
  });
}

/**
 * Separate model/line disagreement by direction so a reader can see a
 * systematic lean without turning an archival comparison into a wager.
 * Rows with a missing or non-finite archived estimate stay out of every
 * direction bucket; exact equality is retained as its own bucket.
 */
export function marginDisagreementDirections(rows: FootballMarketBenchmarkRow[]): MarginDisagreementDirection[] {
  const directions = [
    { key: "model-above" as const, label: "Model above archived line", matches: (gap: number) => gap > 0 },
    { key: "model-below" as const, label: "Model below archived line", matches: (gap: number) => gap < 0 },
    { key: "same" as const, label: "Model equals archived line", matches: (gap: number) => gap === 0 },
  ];
  return directions.map((direction) => {
    const selected = rows.filter((row) => {
      if (row.archived_margin == null || !Number.isFinite(row.archived_margin) || !Number.isFinite(row.model_margin)) return false;
      return direction.matches(row.model_margin - row.archived_margin);
    });
    return {
      key: direction.key,
      label: direction.label,
      ...pairedErrorRecord(selected, (row) => row.model_margin, (row) => row.archived_margin, (row) => row.actual_margin),
    };
  });
}
