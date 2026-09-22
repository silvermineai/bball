export type WomensShotTendency = {
  label: string;
  attempts: number;
  makes: number;
};

export type WomensShotCell = {
  column: number;
  row: number;
  attempts: number;
  makes: number;
};

export type WomensShotProfile = {
  profile_id: string;
  name: string;
  team: string;
  identity_status: "stable" | "ambiguous";
  attempts: number;
  makes: number;
  located_attempts: number;
  cells: WomensShotCell[];
  bands: WomensShotTendency[];
  sides: WomensShotTendency[];
};

export type WomensShotPublication = {
  schema_version: 2;
  sport: "basketball";
  gender: "women";
  season: number;
  generated_at: string;
  coordinate_system: {
    x_min_ft: number;
    x_max_ft: number;
    y_min_ft: number;
    y_max_ft: number;
    grid_columns: number;
    grid_rows: number;
    notes?: string;
  };
  coverage: {
    source_attempts: number;
    profiles: number;
    located_attempts: number;
    ambiguous_profiles: number;
  };
  profiles: WomensShotProfile[];
  receipt: { sha256: string; url: string };
  limitations: string[];
};

const shotProfileBands = ["Rim", "Paint", "Midrange", "3-point"] as const;
const shotProfileSides = ["Chart left", "Middle", "Chart right"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finiteNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function invalidShotPublication(reason: string): never {
  throw new Error(`Women’s shot release failed integrity validation: ${reason}`);
}

function validateTendencies(value: unknown, labels: readonly string[], profileId: string): WomensShotTendency[] {
  if (!Array.isArray(value) || value.length !== labels.length) invalidShotPublication(`${profileId} has an incomplete tendency summary.`);
  const rows = value as unknown[];
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (!isRecord(row) || typeof row.label !== "string" || row.label !== labels[index] || seen.has(row.label) || !finiteNonNegativeInteger(row.attempts) || !finiteNonNegativeInteger(row.makes) || row.makes > row.attempts) {
      invalidShotPublication(`${profileId} has an invalid ${labels === shotProfileBands ? "distance" : "side"} tendency.`);
    }
    seen.add(row.label);
    return { label: row.label, attempts: row.attempts, makes: row.makes };
  });
}

/**
 * Validate the complete women’s coordinate release before rendering it.
 * The shot archive has a separate source identity namespace, so this parser
 * checks scope, receipt, arithmetic and coordinate bounds without joining it
 * to player-season IDs.
 */
export function parseWomensShotPublication(value: unknown): WomensShotPublication {
  if (!isRecord(value) || value.schema_version !== 2 || value.sport !== "basketball" || value.gender !== "women") {
    invalidShotPublication("scope or schema version is not exact.");
  }
  if (!finiteNonNegativeInteger(value.season) || typeof value.generated_at !== "string" || Number.isNaN(Date.parse(value.generated_at))) {
    invalidShotPublication("season or generated_at is invalid.");
  }
  const coordinateSystem = value.coordinate_system;
  if (!isRecord(coordinateSystem)
    || !finiteNumber(coordinateSystem.x_min_ft)
    || !finiteNumber(coordinateSystem.x_max_ft)
    || !finiteNumber(coordinateSystem.y_min_ft)
    || !finiteNumber(coordinateSystem.y_max_ft)
    || coordinateSystem.x_min_ft >= coordinateSystem.x_max_ft
    || coordinateSystem.y_min_ft >= coordinateSystem.y_max_ft
    || !finiteNonNegativeInteger(coordinateSystem.grid_columns)
    || coordinateSystem.grid_columns === 0
    || !finiteNonNegativeInteger(coordinateSystem.grid_rows)
    || coordinateSystem.grid_rows === 0) {
    invalidShotPublication("coordinate system is invalid.");
  }
  const coverage = value.coverage;
  if (!isRecord(coverage)
    || !finiteNonNegativeInteger(coverage.source_attempts)
    || !finiteNonNegativeInteger(coverage.profiles)
    || !finiteNonNegativeInteger(coverage.located_attempts)
    || !finiteNonNegativeInteger(coverage.ambiguous_profiles)) {
    invalidShotPublication("coverage totals are invalid.");
  }
  const receipt = value.receipt;
  if (!isRecord(receipt) || typeof receipt.url !== "string" || !receipt.url.startsWith("https://") || typeof receipt.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(receipt.sha256)) {
    invalidShotPublication("source receipt is invalid.");
  }
  if (!Array.isArray(value.limitations) || value.limitations.length === 0 || value.limitations.some((item) => typeof item !== "string" || !item.trim())) {
    invalidShotPublication("limitations are missing.");
  }
  if (!Array.isArray(value.profiles) || coverage.profiles !== value.profiles.length) {
    invalidShotPublication("profile coverage does not match the retained rows.");
  }
  const profiles: WomensShotProfile[] = [];
  const profileIds = new Set<string>();
  let sourceAttempts = 0;
  let locatedAttempts = 0;
  let ambiguousProfiles = 0;
  for (const raw of value.profiles) {
    if (!isRecord(raw)
      || typeof raw.profile_id !== "string" || !raw.profile_id.trim()
      || typeof raw.name !== "string" || !raw.name.trim()
      || typeof raw.team !== "string" || !raw.team.trim()
      || (raw.identity_status !== "stable" && raw.identity_status !== "ambiguous")
      || profileIds.has(raw.profile_id)
      || !finiteNonNegativeInteger(raw.attempts)
      || !finiteNonNegativeInteger(raw.makes)
      || !finiteNonNegativeInteger(raw.located_attempts)
      || raw.makes > raw.attempts
      || raw.located_attempts > raw.attempts
      || !Array.isArray(raw.cells)) {
      invalidShotPublication("a profile identity or aggregate is invalid.");
    }
    const cells: WomensShotCell[] = [];
    const cellKeys = new Set<string>();
    let cellAttempts = 0;
    for (const cell of raw.cells) {
      if (!isRecord(cell)
        || !finiteNonNegativeInteger(cell.column)
        || cell.column >= coordinateSystem.grid_columns
        || !finiteNonNegativeInteger(cell.row)
        || cell.row >= coordinateSystem.grid_rows
        || !finiteNonNegativeInteger(cell.attempts)
        || !finiteNonNegativeInteger(cell.makes)
        || cell.makes > cell.attempts
        || cellKeys.has(`${cell.column}-${cell.row}`)) {
        invalidShotPublication(`${raw.profile_id} has an invalid coordinate cell.`);
      }
      cellKeys.add(`${cell.column}-${cell.row}`);
      cellAttempts += cell.attempts;
      cells.push({ column: cell.column, row: cell.row, attempts: cell.attempts, makes: cell.makes });
    }
    if (cellAttempts !== raw.located_attempts) invalidShotPublication(`${raw.profile_id} coordinate count does not reconcile.`);
    const bands = validateTendencies(raw.bands, shotProfileBands, raw.profile_id);
    const sides = validateTendencies(raw.sides, shotProfileSides, raw.profile_id);
    if (bands.reduce((sum, row) => sum + row.attempts, 0) !== raw.located_attempts || sides.reduce((sum, row) => sum + row.attempts, 0) !== raw.located_attempts) {
      invalidShotPublication(`${raw.profile_id} tendency totals do not reconcile.`);
    }
    profileIds.add(raw.profile_id);
    sourceAttempts += raw.attempts;
    locatedAttempts += raw.located_attempts;
    ambiguousProfiles += raw.identity_status === "ambiguous" ? 1 : 0;
    profiles.push({
      profile_id: raw.profile_id,
      name: raw.name,
      team: raw.team,
      identity_status: raw.identity_status,
      attempts: raw.attempts,
      makes: raw.makes,
      located_attempts: raw.located_attempts,
      cells,
      bands,
      sides,
    });
  }
  if (sourceAttempts !== coverage.source_attempts || locatedAttempts !== coverage.located_attempts || ambiguousProfiles !== coverage.ambiguous_profiles) {
    invalidShotPublication("coverage totals do not reconcile to profile rows.");
  }
  return {
    schema_version: 2,
    sport: "basketball",
    gender: "women",
    season: value.season,
    generated_at: value.generated_at,
    coordinate_system: {
      x_min_ft: coordinateSystem.x_min_ft,
      x_max_ft: coordinateSystem.x_max_ft,
      y_min_ft: coordinateSystem.y_min_ft,
      y_max_ft: coordinateSystem.y_max_ft,
      grid_columns: coordinateSystem.grid_columns,
      grid_rows: coordinateSystem.grid_rows,
      ...(typeof coordinateSystem.notes === "string" ? { notes: coordinateSystem.notes } : {}),
    },
    coverage: {
      source_attempts: coverage.source_attempts,
      profiles: coverage.profiles,
      located_attempts: coverage.located_attempts,
      ambiguous_profiles: coverage.ambiguous_profiles,
    },
    profiles,
    receipt: { sha256: receipt.sha256, url: receipt.url },
    limitations: value.limitations,
  };
}

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
