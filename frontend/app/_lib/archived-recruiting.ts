export type ArchivedDeparture = {
  name: string;
  position: string | null;
  classYear: string | null;
};

export type ArchivedTeamOutlook = {
  id: string;
  name: string;
  shortName: string;
  conference: string;
  srsRank: number;
  classBreakdown: Record<string, number>;
  rosterSize: number;
  departingCount: number;
  departingShare: number;
  departingStarCount: number;
  positionalNeeds: string[];
  departingNames: ArchivedDeparture[];
};

export type ArchivedRecruitingRelease = {
  season: string;
  teams: ArchivedTeamOutlook[];
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const integerValue = (value: unknown): number | null => {
  const candidate = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return Number.isSafeInteger(candidate) ? Number(candidate) : null;
};

const nonnegativeInteger = (value: unknown): number | null => {
  const candidate = integerValue(value);
  return candidate != null && candidate >= 0 ? candidate : null;
};

const positiveInteger = (value: unknown): number | null => {
  const candidate = integerValue(value);
  return candidate != null && candidate > 0 ? candidate : null;
};

function parseDeparture(value: unknown): ArchivedDeparture | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = text(row.name);
  if (!name) return null;
  return {
    name,
    position: text(row.position),
    classYear: text(row.classYear),
  };
}

function parseTeam(value: unknown): ArchivedTeamOutlook | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = positiveInteger(row.id);
  const name = text(row.name);
  const shortName = text(row.shortName);
  const conference = text(row.conference);
  const srsRank = positiveInteger(row.srsRank);
  const rosterSize = nonnegativeInteger(row.rosterSize);
  const departingCount = nonnegativeInteger(row.departingCount);
  const departingShare = nonnegativeInteger(row.departingShare);
  const departingStarCount = nonnegativeInteger(row.departingStarCount);
  const rawBreakdown = row.classBreakdown;
  const rawNeeds = row.positionalNeeds;
  const rawDepartures = row.departingNames;
  if (
    id == null || !name || !shortName || !conference || srsRank == null ||
    rosterSize == null || departingCount == null || departingShare == null ||
    departingShare > 100 || departingStarCount == null ||
    !rawBreakdown || typeof rawBreakdown !== "object" ||
    !Array.isArray(rawNeeds) || !Array.isArray(rawDepartures)
  ) return null;
  const classBreakdown: Record<string, number> = {};
  for (const [key, count] of Object.entries(rawBreakdown as Record<string, unknown>)) {
    const label = text(key);
    const parsed = nonnegativeInteger(count);
    if (!label || parsed == null) return null;
    classBreakdown[label] = parsed;
  }
  const positionalNeeds = rawNeeds.map(text);
  const departingNames = rawDepartures.map(parseDeparture);
  if (
    positionalNeeds.some((need): need is null => need === null) ||
    departingNames.some((departure): departure is null => departure === null) ||
    departingNames.length !== departingCount
  ) return null;
  return {
    id: String(id),
    name,
    shortName,
    conference,
    srsRank,
    classBreakdown,
    rosterSize,
    departingCount,
    departingShare,
    departingStarCount,
    positionalNeeds: positionalNeeds as string[],
    departingNames: departingNames as ArchivedDeparture[],
  };
}

/**
 * Validate the retained team outlook as a whole before it reaches the UI.
 * Missing class labels are preserved as an explicit gap; no roster member is
 * added to make the class counts balance.
 */
export function parseArchivedRecruitingRelease(value: unknown): ArchivedRecruitingRelease {
  if (!value || typeof value !== "object") throw new Error("Archived recruiting release is not an object.");
  const raw = value as Record<string, unknown>;
  const season = text(raw.season);
  const rawTeams = raw.teams;
  if (!season || !Array.isArray(rawTeams) || rawTeams.length === 0) {
    throw new Error("Archived recruiting release has no season or team rows.");
  }
  const teams = rawTeams.map(parseTeam);
  if (teams.some((team): team is null => team === null)) {
    throw new Error("Archived recruiting release contains a malformed team row.");
  }
  const parsedTeams = teams as ArchivedTeamOutlook[];
  const ids = new Set(parsedTeams.map((team) => team.id));
  if (ids.size !== parsedTeams.length) throw new Error("Archived recruiting release contains duplicate team IDs.");
  const ranks = new Set(parsedTeams.map((team) => team.srsRank));
  if (ranks.size !== parsedTeams.length) throw new Error("Archived recruiting release contains duplicate ranking values.");
  return { season, teams: parsedTeams };
}

export type ArchivedTeamSort = "rank" | "departure_share" | "departures" | "roster" | "name";
export type ArchivedTeamFilters = {
  query: string;
  conference: string;
  sort: ArchivedTeamSort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};

/** Filter and sort without changing the retained order or source rows. */
export function filterArchivedTeamOutlooks(
  rows: ArchivedTeamOutlook[],
  filters: ArchivedTeamFilters,
) {
  const query = filters.query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const matchesQuery = !query || `${row.name} ${row.shortName} ${row.conference} ${row.id}`.toLowerCase().includes(query);
    return matchesQuery && (!filters.conference || row.conference === filters.conference);
  });
  const multiplier = filters.direction === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === "name") return multiplier * left.name.localeCompare(right.name);
    const leftValue = filters.sort === "rank" ? left.srsRank
      : filters.sort === "departure_share" ? left.departingShare
        : filters.sort === "departures" ? left.departingCount : left.rosterSize;
    const rightValue = filters.sort === "rank" ? right.srsRank
      : filters.sort === "departure_share" ? right.departingShare
        : filters.sort === "departures" ? right.departingCount : right.rosterSize;
    return multiplier * (leftValue - rightValue) || left.name.localeCompare(right.name);
  });
  const pageSize = Math.max(1, Math.floor(filters.pageSize));
  const page = Math.max(0, Math.floor(filters.page));
  return {
    total: sorted.length,
    rows: sorted.slice(page * pageSize, (page + 1) * pageSize),
  };
}

export function archivedClassGap(row: ArchivedTeamOutlook) {
  const classified = Object.values(row.classBreakdown).reduce((total, value) => total + value, 0);
  return row.rosterSize - classified;
}
