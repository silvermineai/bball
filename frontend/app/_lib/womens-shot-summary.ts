export type WomensShotTendency = {
  label: string;
  attempts: number;
  makes: number;
};

export type WomensShotTendencyStat = WomensShotTendency & {
  share: number;
  makeRate: number | null;
};

export type WomensShotProfileIdentity = {
  profile_id: string;
  name: string;
  team: string;
};

export type WomensShotProfileMatch = {
  /** Profiles whose normalized name and team labels both match. */
  exact: WomensShotProfileIdentity[];
  /** A source abbreviation and a full team label can be compared conservatively. */
  compatible: WomensShotProfileIdentity[];
  /** Name matches are useful review candidates but never establish identity. */
  nameMatches: WomensShotProfileIdentity[];
};

const identityText = (value: unknown) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/**
 * Compare a player file with the separate shot-profile namespace.
 *
 * Exact name + team matches, or a unique conservative abbreviation/full-team
 * compatibility match, can be opened as a convenience. Name-only matches are
 * returned for manual review; callers must not silently treat them as an
 * athlete join.
 */
export function matchWomensShotProfiles(
  profiles: readonly WomensShotProfileIdentity[],
  name: string,
  team: string,
): WomensShotProfileMatch {
  const playerName = identityText(name);
  const playerTeam = identityText(team);
  if (!playerName) return { exact: [], compatible: [], nameMatches: [] };
  const nameMatches = profiles.filter((profile) => identityText(profile.name) === playerName);
  const exact = playerTeam
    ? nameMatches.filter((profile) => identityText(profile.team) === playerTeam)
    : [];
  const compatible = playerTeam
    ? nameMatches.filter((profile) => {
      const sourceTeam = identityText(profile.team);
      return sourceTeam === playerTeam || sourceTeam.includes(playerTeam) || playerTeam.includes(sourceTeam);
    })
    : [];
  return { exact, compatible, nameMatches };
}

/** Build a label-search handoff; shot profile IDs remain separate from player IDs. */
export function womensShotProfileSearchHref(name: string) {
  const params = new URLSearchParams({ gender: "women", division: "1" });
  const query = name.trim();
  if (query) params.set("q", query);
  return "/basketball/ncaa-shooting/?" + params.toString();
}

/**
 * Calculate tendency shares against located attempts only. Missing locations
 * remain in the profile total and cannot silently dilute a court-region rate.
 */
export function womensShotTendencyStats(
  rows: readonly WomensShotTendency[],
  locatedAttempts: number,
): WomensShotTendencyStat[] {
  const denominator = Number.isFinite(locatedAttempts) && locatedAttempts > 0 ? locatedAttempts : 0;
  return rows.map((row) => {
    const attempts = Number.isFinite(row.attempts) && row.attempts >= 0 ? row.attempts : 0;
    const validMakes = Number.isFinite(row.makes) && row.makes >= 0 && row.makes <= attempts;
    const makes = validMakes ? row.makes : 0;
    return {
      ...row,
      attempts,
      makes,
      share: denominator ? attempts / denominator : 0,
      makeRate: attempts && validMakes ? makes / attempts : null,
    };
  });
}
