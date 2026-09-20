export type ProspectPeerContextPayload = {
  season?: unknown;
  athlete_id?: unknown;
  edition?: unknown;
  position?: unknown;
  target_height_inches?: unknown;
  target_weight_pounds?: unknown;
  peers?: unknown;
  position_ranked?: unknown;
  height_recorded?: unknown;
  height_below?: unknown;
  height_equal?: unknown;
  average_height_inches?: unknown;
  weight_recorded?: unknown;
  weight_below?: unknown;
  weight_equal?: unknown;
  average_weight_pounds?: unknown;
};

export type ProspectPeerContext = {
  position: string;
  peers: number;
  positionRanked: number;
  height: {
    value: number;
    recorded: number;
    below: number;
    equal: number;
    average: number;
    percentile: number;
  } | null;
  weight: {
    value: number;
    recorded: number;
    below: number;
    equal: number;
    average: number;
    percentile: number;
  } | null;
};

const integer = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

function distribution(
  value: unknown,
  recordedValue: unknown,
  belowValue: unknown,
  equalValue: unknown,
  averageValue: unknown,
) {
  const measured = positive(value);
  const recorded = integer(recordedValue);
  const below = integer(belowValue);
  const equal = integer(equalValue);
  const average = positive(averageValue);
  if (measured == null || recorded == null || recorded < 1 || below == null || equal == null || equal < 1 || average == null) return null;
  if (below + equal > recorded) return null;
  return {
    value: measured,
    recorded,
    below,
    equal,
    average,
    percentile: ((below + equal / 2) / recorded) * 100,
  };
}

/**
 * Validate that peer counts describe this exact prospect and recruiting
 * edition before turning the raw cohort counts into display context.
 */
export function prospectPeerContext(
  payload: ProspectPeerContextPayload | null | undefined,
  expected: { season: string; athleteId: string; edition: string | null; position: string | null },
): ProspectPeerContext | null {
  if (!payload || String(payload.season) !== expected.season || payload.athlete_id !== expected.athleteId) return null;
  if (!expected.edition || payload.edition !== expected.edition) return null;
  const position = typeof payload.position === "string" ? payload.position.trim().toUpperCase() : "";
  if (!position || position !== expected.position?.trim().toUpperCase()) return null;
  const peers = integer(payload.peers);
  const positionRanked = integer(payload.position_ranked);
  if (peers == null || peers < 1 || positionRanked == null || positionRanked > peers) return null;
  return {
    position,
    peers,
    positionRanked,
    height: distribution(payload.target_height_inches, payload.height_recorded, payload.height_below, payload.height_equal, payload.average_height_inches),
    weight: distribution(payload.target_weight_pounds, payload.weight_recorded, payload.weight_below, payload.weight_equal, payload.average_weight_pounds),
  };
}
