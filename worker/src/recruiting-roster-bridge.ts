/**
 * Exact-ID bridge between a public prospect release and the retained college
 * roster/participation warehouse.  Names are deliberately never used here:
 * a prospect can only receive roster context when the publisher athlete ID is
 * present in the source row as the same immutable ID.
 */

export type RecruitingRosterBridgeRosterRow = {
  season: number;
  team_id: string;
  team: string;
  name: string;
  position: string | null;
  class_year: string | null;
};

export type RecruitingRosterBridgeParticipationRow = {
  season: number;
  team_id: string;
  name: string | null;
  games: number | null;
  minutes: number | null;
};

export type RecruitingRosterBridgeReceipt = {
  dataset: "rosters" | "player_box" | "player_season";
  season: number;
  fetched_at: string | null;
  sha256: string;
};

export type RecruitingRosterBridge = {
  athlete_id: string;
  roster_rows: RecruitingRosterBridgeRosterRow[];
  participation_rows: RecruitingRosterBridgeParticipationRow[];
  receipts: RecruitingRosterBridgeReceipt[];
  integrity: "verified" | "unavailable";
  note: string;
};

type RawRosterRow = {
  season: number;
  team_id: unknown;
  profile_json: unknown;
};

type RawParticipationRow = {
  season: number;
  team_id: unknown;
  athlete_id: unknown;
  name: unknown;
  games: unknown;
  minutes: unknown;
};

type RawReceipt = {
  dataset: unknown;
  season: unknown;
  fetched_at: unknown;
  sha256: unknown;
};

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function profile(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * Build a source-receipted bridge.  Any malformed exact-ID row invalidates
 * the bridge as a whole; dropping a bad row would make a partial archive look
 * like a complete player history.
 */
export function buildRecruitingRosterBridge(
  athleteId: string,
  rosterRows: RawRosterRow[],
  participationRows: RawParticipationRow[],
  receipts: RawReceipt[],
): RecruitingRosterBridge | null {
  if (!/^\d{1,15}$/.test(athleteId)) return null;
  const seenRosters = new Set<string>();
  const normalizedRosters: RecruitingRosterBridgeRosterRow[] = [];
  for (const row of rosterRows) {
    if (!positiveInteger(row.season)) return null;
    const teamId = text(row.team_id);
    const parsed = profile(row.profile_json);
    const name = text(parsed?.full_name);
    const team = text(parsed?.team_display_name);
    const key = `${row.season}:${teamId || ""}`;
    if (!teamId || !parsed || !name || !team || seenRosters.has(key)) return null;
    seenRosters.add(key);
    const position = text(parsed.position_abbreviation);
    const classYear = text(parsed.experience_display_value);
    normalizedRosters.push({ season: row.season, team_id: teamId, team, name, position, class_year: classYear });
  }

  const seenParticipation = new Set<string>();
  const normalizedParticipation: RecruitingRosterBridgeParticipationRow[] = [];
  for (const row of participationRows) {
    if (!positiveInteger(row.season)) return null;
    const teamId = text(row.team_id);
    const rowAthleteId = text(row.athlete_id);
    const key = `${row.season}:${teamId || ""}`;
    if (!teamId || rowAthleteId !== athleteId || seenParticipation.has(key)) return null;
    const games = row.games == null ? null : row.games;
    const minutes = row.minutes == null ? null : row.minutes;
    if ((games != null && !nonNegative(games)) || (minutes != null && !nonNegative(minutes))) return null;
    seenParticipation.add(key);
    normalizedParticipation.push({
      season: row.season,
      team_id: teamId,
      name: text(row.name),
      games: games == null ? null : Number(games),
      minutes: minutes == null ? null : Number(minutes),
    });
  }

  const seenReceipts = new Set<string>();
  const normalizedReceipts: RecruitingRosterBridgeReceipt[] = [];
  for (const receipt of receipts) {
    const dataset = receipt.dataset;
    const season = receipt.season;
    const sha256 = text(receipt.sha256)?.toLowerCase() || "";
    if (dataset !== "rosters" && dataset !== "player_box" && dataset !== "player_season") return null;
    if (!positiveInteger(season) || !/^[a-f0-9]{64}$/.test(sha256)) return null;
    const key = `${dataset}:${season}`;
    if (seenReceipts.has(key)) return null;
    const fetchedAt = receipt.fetched_at == null ? null : text(receipt.fetched_at);
    if (receipt.fetched_at != null && (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt)))) return null;
    seenReceipts.add(key);
    normalizedReceipts.push({ dataset, season, fetched_at: fetchedAt, sha256 });
  }

  const observedSeasons = new Set([...normalizedRosters, ...normalizedParticipation].map((row) => row.season));
  const coveredSeasons = new Set(normalizedReceipts.map((receipt) => receipt.season));
  const verified = [...observedSeasons].every((season) => coveredSeasons.has(season));
  return {
    athlete_id: athleteId,
    roster_rows: normalizedRosters,
    participation_rows: normalizedParticipation,
    receipts: normalizedReceipts.sort((a, b) => b.season - a.season || a.dataset.localeCompare(b.dataset)),
    integrity: verified ? "verified" : "unavailable",
    note: "Rows are joined only by the exact publisher athlete ID. A retained roster or participation row describes source observation; it does not establish recruiting commitment, eligibility, transfer status or future role.",
  };
}
