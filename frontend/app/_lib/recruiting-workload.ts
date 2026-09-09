export type RecruitingWorkloadInput = {
  priorMinutes: number;
  returningMinutes: number;
  incomingMinutes: number;
};

export type RecruitingWorkloadResult = RecruitingWorkloadInput & {
  representedMinutes: number;
  unrepresentedMinutes: number;
  returningShare: number | null;
  incomingShare: number | null;
  representedShare: number | null;
};

/**
 * Summarize observed minutes without treating an absent row as a departure.
 * Incoming minutes are prior workload at another program, so they are kept
 * separate from the returning share even when both contribute to coverage.
 */
export function recruitingWorkload(
  input: RecruitingWorkloadInput,
): RecruitingWorkloadResult {
  const priorMinutes = Math.max(0, input.priorMinutes);
  const returningMinutes = Math.max(0, input.returningMinutes);
  const incomingMinutes = Math.max(0, input.incomingMinutes);
  const representedMinutes = returningMinutes + incomingMinutes;
  const share = (value: number) => (priorMinutes > 0 ? value / priorMinutes : null);
  return {
    priorMinutes,
    returningMinutes,
    incomingMinutes,
    representedMinutes,
    unrepresentedMinutes: Math.max(0, priorMinutes - representedMinutes),
    returningShare: share(returningMinutes),
    incomingShare: share(incomingMinutes),
    representedShare: share(representedMinutes),
  };
}
