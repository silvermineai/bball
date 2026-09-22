import type { ProspectClassContextPayload } from "./class-context";
import type { RecruitingHistoryEntry } from "./commitment-history";
import type { ProspectPeerContextPayload } from "./peer-context";

export type ProspectDossierProspect = {
  athlete_id: string;
  name: string;
  position: string | null;
  grade: number | null;
  rank: number | null;
  position_rank: number | null;
  state_rank: number | null;
  region_rank: number | null;
  status: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  hometown: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
  captured_at: string;
  source_url: string;
  previous_rank?: number | null;
  previous_captured_at?: string | null;
  school_ids?: string[];
};

type SourceReceipt = {
  dataset: string;
  captured_at: string;
  source_rows: number;
  sha256: string | null;
  sha256_scope: "release_edition" | "unavailable";
  integrity: "verified" | "unavailable";
};

export type ProspectDossierResponse = {
  season: number;
  rows: ProspectDossierProspect[];
  edition?: string | null;
  captured_at: string | null;
  source_receipt?: SourceReceipt | null;
  history?: RecruitingHistoryEntry[];
  class_context?: ProspectClassContextPayload;
  peer_context?: ProspectPeerContextPayload;
  roster_bridge?: unknown;
  source?: { provider: string; methodology: string };
  unavailable_reason?: string;
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === "string" ? value : undefined;
}

function nullableFinite(value: unknown): number | null | undefined {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nullableRank(value: unknown): number | null | undefined {
  if (value == null) return null;
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function parseReceipt(value: unknown): SourceReceipt | null | undefined {
  if (value == null) return value === null ? null : undefined;
  const row = record(value);
  if (!row
    || typeof row.dataset !== "string"
    || !validTimestamp(row.captured_at)
    || !Number.isSafeInteger(row.source_rows) || Number(row.source_rows) < 0
    || (row.sha256 !== null && row.sha256 !== undefined && (typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(row.sha256)))
    || row.sha256_scope !== "release_edition" && row.sha256_scope !== "unavailable"
    || row.integrity !== "verified" && row.integrity !== "unavailable") return undefined;
  return {
    dataset: row.dataset,
    captured_at: row.captured_at,
    source_rows: Number(row.source_rows),
    sha256: row.sha256 == null ? null : row.sha256.toLowerCase(),
    sha256_scope: row.sha256_scope,
    integrity: row.integrity,
  };
}

/**
 * A verified prospect dossier receipt must describe the same edition and
 * observation clock as the payload. Without this binding, a malformed or
 * stale receipt could make an otherwise valid row look release verified.
 */
function verifiedReceiptMatchesPayload(
  receipt: SourceReceipt | null,
  edition: string | null,
  capturedAt: string | null,
): boolean {
  if (!receipt || receipt.integrity !== "verified" || receipt.sha256_scope !== "release_edition") return true;
  return /^[a-f0-9]{64}$/i.test(edition || "")
    && receipt.sha256 !== null
    && receipt.sha256 === edition!.toLowerCase()
    && receipt.source_rows > 0
    && capturedAt !== null
    && receipt.captured_at === capturedAt;
}

/**
 * Validate a live exact-ID prospect response before rendering it. A name
 * search can return duplicates or a neighboring row; only one string-exact
 * athlete ID is admitted. Missing source fields remain null/undefined and
 * are never filled from another prospect or dataset.
 */
export function parseProspectDossierPayload(
  value: unknown,
  expectedSeason: number,
  expectedAthleteId: string,
): ProspectDossierResponse | null {
  const payload = record(value);
  if (!payload
    || payload.season !== expectedSeason
    || !/^\d{1,15}$/.test(expectedAthleteId)
    || !Array.isArray(payload.rows)) return null;

  const matches = payload.rows.filter((candidate) => {
    const row = record(candidate);
    return row?.athlete_id === expectedAthleteId;
  });
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (!row || typeof row.athlete_id !== "string" || typeof row.name !== "string" || !row.name.trim()
    || typeof row.captured_at !== "string" || !validTimestamp(row.captured_at)
    || typeof row.source_url !== "string") return null;

  const position = nullableString(row.position);
  const grade = nullableFinite(row.grade);
  const rank = nullableRank(row.rank);
  const positionRank = nullableRank(row.position_rank);
  const stateRank = nullableRank(row.state_rank);
  const regionRank = nullableRank(row.region_rank);
  const status = nullableString(row.status);
  const committedTeamId = nullableString(row.committed_team_id);
  const committedTeamName = nullableString(row.committed_team_name);
  const highSchool = nullableString(row.high_school);
  const hometown = nullableString(row.hometown);
  const height = nullableFinite(row.height_inches);
  const weight = nullableFinite(row.weight_pounds);
  const previousRank = nullableRank(row.previous_rank);
  const previousCapturedAt = row.previous_captured_at == null ? null : validTimestamp(row.previous_captured_at) ? row.previous_captured_at : undefined;
  if (position === undefined || grade === undefined || rank === undefined || positionRank === undefined
    || stateRank === undefined || regionRank === undefined || status === undefined
    || committedTeamId === undefined || committedTeamName === undefined || highSchool === undefined
    || hometown === undefined || height === undefined || weight === undefined
    || previousRank === undefined || previousCapturedAt === undefined
    || grade != null && grade < 0
    || height != null && height <= 0
    || weight != null && weight <= 0) return null;

  let schoolIds: string[] | undefined;
  if (row.school_ids !== undefined) {
    if (!Array.isArray(row.school_ids) || !row.school_ids.every((id: unknown) => typeof id === "string" && id.trim() !== "")) return null;
    schoolIds = row.school_ids.slice() as string[];
  }

  const capturedAt = payload.captured_at == null ? null : validTimestamp(payload.captured_at) ? payload.captured_at : undefined;
  const edition = payload.edition == null ? null : typeof payload.edition === "string" && payload.edition.trim() ? payload.edition : undefined;
  const sourceReceipt = payload.source_receipt === undefined ? null : parseReceipt(payload.source_receipt);
  const source = payload.source == null ? undefined : record(payload.source);
  if (capturedAt === undefined || edition === undefined || sourceReceipt === undefined
    || !verifiedReceiptMatchesPayload(sourceReceipt, edition, capturedAt)
    || payload.history !== undefined && !Array.isArray(payload.history)
    || source && (typeof source.provider !== "string" || typeof source.methodology !== "string")) return null;

  return {
    season: expectedSeason,
    rows: [{
      athlete_id: expectedAthleteId,
      name: row.name.trim(),
      position,
      grade,
      rank,
      position_rank: positionRank,
      state_rank: stateRank,
      region_rank: regionRank,
      status,
      committed_team_id: committedTeamId,
      committed_team_name: committedTeamName,
      high_school: highSchool,
      hometown,
      height_inches: height,
      weight_pounds: weight,
      captured_at: row.captured_at,
      source_url: row.source_url,
      ...(row.previous_rank !== undefined ? { previous_rank: previousRank } : {}),
      ...(row.previous_captured_at !== undefined ? { previous_captured_at: previousCapturedAt } : {}),
      ...(schoolIds !== undefined ? { school_ids: schoolIds } : {}),
    }],
    edition,
    captured_at: capturedAt,
    ...(sourceReceipt !== undefined ? { source_receipt: sourceReceipt } : {}),
    ...(payload.history !== undefined ? { history: payload.history as RecruitingHistoryEntry[] } : {}),
    ...(payload.class_context !== undefined ? { class_context: payload.class_context as ProspectClassContextPayload } : {}),
    ...(payload.peer_context !== undefined ? { peer_context: payload.peer_context as ProspectPeerContextPayload } : {}),
    ...(payload.roster_bridge !== undefined ? { roster_bridge: payload.roster_bridge } : {}),
    ...(source ? { source: { provider: source.provider as string, methodology: source.methodology as string } } : {}),
    ...(typeof payload.unavailable_reason === "string" ? { unavailable_reason: payload.unavailable_reason } : {}),
  };
}
