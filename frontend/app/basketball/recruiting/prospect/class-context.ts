export type ProspectClassContextPayload = {
  total: number;
  committed: number;
  ranked: number;
  graded: number;
};

export type ProspectClassContext = ProspectClassContextPayload & {
  nationalRank: number | null;
  rankCoverage: number | null;
  gradeCoverage: number | null;
  commitmentRate: number | null;
};

const count = (value: number, total: number) => Number.isInteger(value) && value >= 0 && value <= total;

/** Validate the unfiltered same-edition denominator before showing it beside an exact prospect. */
export function prospectClassContext(
  payload: ProspectClassContextPayload | null | undefined,
  nationalRank: number | null,
): ProspectClassContext | null {
  if (!payload || !Number.isInteger(payload.total) || payload.total <= 0) return null;
  if (!count(payload.committed, payload.total) || !count(payload.ranked, payload.total) || !count(payload.graded, payload.total)) return null;
  const rank = Number.isInteger(nationalRank) && (nationalRank ?? 0) > 0 && (nationalRank ?? 0) <= payload.ranked
    ? nationalRank
    : null;
  return {
    ...payload,
    nationalRank: rank,
    rankCoverage: payload.total ? payload.ranked / payload.total : null,
    gradeCoverage: payload.total ? payload.graded / payload.total : null,
    commitmentRate: payload.total ? payload.committed / payload.total : null,
  };
}
