export type LowerDivisionTargetProbe = {
  target_season?: string;
  requested_months?: number[];
  generated_at?: string;
  source?: { season_year?: number; probe_note?: string };
  calendar?: unknown[];
  contests?: unknown[];
  receipts?: Array<{ sha256?: string; url?: string }>;
};

export type LowerDivisionTargetProbeSummary = {
  season: string;
  seasonYear: number;
  months: number[];
  generatedAt: string;
  calendarDays: number;
  contests: number;
  receipts: number;
};

/**
 * Summarize an availability probe without treating an empty response as a
 * schedule. The probe is useful evidence for the prediction gate, while the
 * historical archive remains the only source for descriptive tables.
 */
export function summarizeLowerDivisionTargetProbe(
  probe: LowerDivisionTargetProbe | null | undefined,
): LowerDivisionTargetProbeSummary | null {
  const seasonYear = probe?.source?.season_year;
  const generatedAt = probe?.generated_at;
  if (typeof seasonYear !== "number" || !Number.isInteger(seasonYear) || typeof generatedAt !== "string" || !generatedAt.trim()) return null;
  if (!Array.isArray(probe?.requested_months) || !probe.requested_months.every((month) => Number.isInteger(month) && month >= 1 && month <= 12)) return null;
  if (!Array.isArray(probe?.calendar) || !Array.isArray(probe?.contests) || !Array.isArray(probe?.receipts)) return null;
  const receiptCount = probe.receipts.filter((receipt) => typeof receipt?.sha256 === "string" && /^[0-9a-f]{64}$/i.test(receipt.sha256)).length;
  if (!receiptCount) return null;
  return {
    season: probe.target_season || `${seasonYear}-${String(seasonYear + 1).slice(-2)}`,
    seasonYear,
    months: [...probe.requested_months],
    generatedAt,
    calendarDays: probe.calendar.length,
    contests: probe.contests.length,
    receipts: receiptCount,
  };
}
