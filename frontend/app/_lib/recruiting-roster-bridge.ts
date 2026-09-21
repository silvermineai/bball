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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Validate an exact-ID recruiting-to-roster bridge before displaying it. */
export function parseRecruitingRosterBridge(payload: unknown, expectedAthleteId: string): RecruitingRosterBridge | null {
  if (!isRecord(payload)
    || !/^\d{1,15}$/.test(expectedAthleteId)
    || payload.athlete_id !== expectedAthleteId
    || !Array.isArray(payload.roster_rows)
    || !Array.isArray(payload.participation_rows)
    || !Array.isArray(payload.receipts)
    || (payload.integrity !== "verified" && payload.integrity !== "unavailable")
    || typeof payload.note !== "string"
    || !payload.note.trim()) return null;

  const rosterKeys = new Set<string>();
  const rosterRows: RecruitingRosterBridgeRosterRow[] = [];
  for (const value of payload.roster_rows) {
    if (!isRecord(value)
      || !positiveInteger(value.season)
      || !text(value.team_id)
      || !text(value.team)
      || !text(value.name)
      || (value.position != null && typeof value.position !== "string")
      || (value.class_year != null && typeof value.class_year !== "string")) return null;
    const teamId = text(value.team_id)!;
    const key = `${value.season}:${teamId}`;
    if (rosterKeys.has(key)) return null;
    rosterKeys.add(key);
    rosterRows.push({
      season: Number(value.season),
      team_id: teamId,
      team: text(value.team)!,
      name: text(value.name)!,
      position: text(value.position),
      class_year: text(value.class_year),
    });
  }

  const participationKeys = new Set<string>();
  const participationRows: RecruitingRosterBridgeParticipationRow[] = [];
  for (const value of payload.participation_rows) {
    if (!isRecord(value)
      || !positiveInteger(value.season)
      || !text(value.team_id)
      || (value.name != null && typeof value.name !== "string")
      || (value.games != null && !nonNegative(value.games))
      || (value.minutes != null && !nonNegative(value.minutes))) return null;
    const teamId = text(value.team_id)!;
    const key = `${value.season}:${teamId}`;
    if (participationKeys.has(key)) return null;
    participationKeys.add(key);
    participationRows.push({
      season: Number(value.season),
      team_id: teamId,
      name: text(value.name),
      games: value.games == null ? null : Number(value.games),
      minutes: value.minutes == null ? null : Number(value.minutes),
    });
  }

  const receiptKeys = new Set<string>();
  const receipts: RecruitingRosterBridgeReceipt[] = [];
  for (const value of payload.receipts) {
    if (!isRecord(value)
      || (value.dataset !== "rosters" && value.dataset !== "player_box" && value.dataset !== "player_season")
      || !positiveInteger(value.season)
      || typeof value.sha256 !== "string"
      || !/^[a-f0-9]{64}$/i.test(value.sha256)
      || (value.fetched_at != null && (typeof value.fetched_at !== "string" || !Number.isFinite(Date.parse(value.fetched_at))))) return null;
    const key = `${value.dataset}:${value.season}`;
    if (receiptKeys.has(key)) return null;
    receiptKeys.add(key);
    receipts.push({
      dataset: value.dataset,
      season: Number(value.season),
      fetched_at: value.fetched_at == null ? null : value.fetched_at,
      sha256: value.sha256.toLowerCase(),
    });
  }

  const observedSeasons = new Set([...rosterRows, ...participationRows].map((row) => row.season));
  const coveredSeasons = new Set(receipts.map((receipt) => receipt.season));
  const covered = [...observedSeasons].every((season) => coveredSeasons.has(season));
  if (payload.integrity === "verified" && !covered) return null;
  if (payload.integrity === "verified" && observedSeasons.size === 0) return null;
  return {
    athlete_id: expectedAthleteId,
    roster_rows: rosterRows,
    participation_rows: participationRows,
    receipts,
    integrity: payload.integrity,
    note: payload.note.trim(),
  };
}
