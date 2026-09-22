import { womensPlayerStatValue, type WomensPlayerStats } from "./womens-player-detail";

export type WomensObservedPlayer = {
  player_id: string;
  name: string;
  team: string;
  position?: string | null;
  stats: WomensPlayerStats;
};

export type WomensObservedMetric = "avgPoints" | "avgRebounds" | "avgAssists" | "avgMinutes";

export type WomensRecruitingProspect = {
  athlete_id: string;
  name: string;
  position?: string | null;
  grade?: number | null;
  rank?: number | null;
  status?: string | null;
  committed_team_id?: string | null;
  committed_team_name?: string | null;
  high_school?: string | null;
  hometown?: string | null;
};

export type WomensRecruitingStatusSummary = {
  status: string;
  prospects: number;
  graded: number;
  averageGrade: number | null;
  exactIds: number;
  destinationIds: number;
};

export type WomensRecruitingRelease = {
  schema_version: 1;
  sport: "basketball";
  gender: "women";
  season: number;
  edition: string;
  captured_at: string;
  source: {
    publisher: "ESPN";
    league: "womens-college-basketball";
    list_url: string;
    list_sha256: string;
    detail_url_template: string;
    receipt_count: number;
  };
  coverage: {
    prospects: number;
    graded: number;
    ranked: number;
    committed: number;
  };
  records: WomensRecruitingProspect[];
};

const releaseDigest = /^[a-f0-9]{64}$/i;
const sourceId = /^\d{1,15}$/;
const httpsUrl = /^https:\/\/[^\s]+$/i;

type ValidatedSource = WomensRecruitingRelease["source"];

function validateSource(value: unknown, season: number, recordCount: number): ValidatedSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const listUrl = typeof source.list_url === "string" ? source.list_url.trim() : "";
  const detailUrlTemplate = typeof source.detail_url_template === "string" ? source.detail_url_template.trim() : "";
  const receiptCount = source.receipt_count;
  if (source.publisher !== "ESPN" || source.league !== "womens-college-basketball") return null;
  if (!httpsUrl.test(listUrl) || !listUrl.includes(`/seasons/${season}/recruits`)) return null;
  if (!httpsUrl.test(detailUrlTemplate) || !detailUrlTemplate.includes("/recruits/{athlete_id}")) return null;
  if (!releaseDigest.test(String(source.list_sha256 || ""))) return null;
  if (!Number.isSafeInteger(receiptCount) || receiptCount !== recordCount + 1) return null;
  return {
    publisher: "ESPN",
    league: "womens-college-basketball",
    list_url: listUrl,
    list_sha256: String(source.list_sha256).toLowerCase(),
    detail_url_template: detailUrlTemplate,
    receipt_count: receiptCount,
  };
}

/**
 * Validate the complete source-native women's prospect release before the UI
 * treats its counts or rows as a coherent cohort. The release is static at
 * the edge today, so this keeps a truncated or duplicated artifact from
 * looking like a complete recruiting board while preserving source missingness.
 */
export function validateWomensRecruitingRelease(value: unknown): WomensRecruitingRelease | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.schema_version !== 1 || payload.sport !== "basketball" || payload.gender !== "women") return null;
  const season = payload.season;
  if (!Number.isSafeInteger(season) || Number(season) < 2025 || Number(season) > 2035) return null;
  const edition = typeof payload.edition === "string" ? payload.edition.trim().toLowerCase() : "";
  const capturedAt = typeof payload.captured_at === "string" ? payload.captured_at.trim() : "";
  if (!releaseDigest.test(edition) || !capturedAt || Number.isNaN(Date.parse(capturedAt))) return null;
  const rawCoverage = payload.coverage;
  if (!rawCoverage || typeof rawCoverage !== "object" || Array.isArray(rawCoverage)) return null;
  const coverage = rawCoverage as Record<string, unknown>;
  const count = (key: string) => {
    const number = coverage[key];
    return Number.isSafeInteger(number) && Number(number) >= 0 ? Number(number) : null;
  };
  const prospects = count("prospects");
  const graded = count("graded");
  const ranked = count("ranked");
  const committed = count("committed");
  if (prospects == null || graded == null || ranked == null || committed == null) return null;
  const rawRecords = payload.records;
  if (!Array.isArray(rawRecords) || rawRecords.length === 0 || rawRecords.length !== prospects) return null;
  const source = validateSource(payload.source, Number(season), rawRecords.length);
  if (!source) return null;
  const ids = new Set<string>();
  const records: WomensRecruitingProspect[] = [];
  for (const raw of rawRecords) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const athleteId = typeof record.athlete_id === "string" ? record.athlete_id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!sourceId.test(athleteId) || !name || ids.has(athleteId)) return null;
    const sourceSha256 = typeof record.source_sha256 === "string" ? record.source_sha256.trim().toLowerCase() : "";
    const sourceUrl = typeof record.source_url === "string" ? record.source_url.trim() : "";
    const recordCapturedAt = typeof record.captured_at === "string" ? record.captured_at.trim() : "";
    if (!releaseDigest.test(sourceSha256) || !httpsUrl.test(sourceUrl)
      || sourceUrl !== source.detail_url_template.replace("{athlete_id}", athleteId)
      || record.recruiting_class !== season
      || recordCapturedAt !== capturedAt
      || Number.isNaN(Date.parse(recordCapturedAt))) return null;
    const grade = record.grade == null ? null : record.grade;
    const rank = record.rank == null ? null : record.rank;
    if (grade != null && (typeof grade !== "number" || !Number.isFinite(grade) || grade < 0)) return null;
    if (rank != null && (typeof rank !== "number" || !Number.isSafeInteger(rank) || rank <= 0)) return null;
    ids.add(athleteId);
    records.push({
      athlete_id: athleteId,
      name,
      position: typeof record.position === "string" && record.position.trim() ? record.position.trim() : null,
      grade: grade as number | null,
      rank: rank as number | null,
      status: typeof record.status === "string" && record.status.trim() ? record.status.trim() : null,
      committed_team_id: typeof record.committed_team_id === "string" && record.committed_team_id.trim() ? record.committed_team_id.trim() : null,
      committed_team_name: typeof record.committed_team_name === "string" && record.committed_team_name.trim() ? record.committed_team_name.trim() : null,
      high_school: typeof record.high_school === "string" && record.high_school.trim() ? record.high_school.trim() : null,
      hometown: typeof record.hometown === "string" && record.hometown.trim() ? record.hometown.trim() : null,
    });
  }
  const measured = {
    graded: records.filter((record) => record.grade != null).length,
    ranked: records.filter((record) => record.rank != null).length,
    committed: records.filter((record) => record.committed_team_id != null).length,
  };
  if (measured.graded !== graded || measured.ranked !== ranked || measured.committed !== committed) return null;
  return {
    schema_version: 1,
    sport: "basketball",
    gender: "women",
    season: Number(season),
    edition,
    captured_at: capturedAt,
    source,
    coverage: { prospects, graded, ranked, committed },
    records,
  };
}

/** Filter and sort the women-specific prospect cohort without inventing ranks. */
export function rankWomensRecruitingProspects(
  records: WomensRecruitingProspect[],
  query = "",
  limit = 20,
): WomensRecruitingProspect[] {
  const needle = query.trim().toLowerCase();
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
  return records
    .filter((row) => !needle || `${row.name} ${row.position || ""} ${row.high_school || ""} ${row.hometown || ""} ${row.athlete_id}`.toLowerCase().includes(needle))
    .sort((left, right) => (right.grade ?? -Infinity) - (left.grade ?? -Infinity) || left.name.localeCompare(right.name) || left.athlete_id.localeCompare(right.athlete_id))
    .slice(0, safeLimit);
}

/**
 * Summarize the source status field without promoting it to a destination or
 * commitment join. Duplicate or blank source IDs invalidate the summary so a
 * status trend cannot double-count a prospect.
 */
export function summarizeWomensRecruitingProspects(
  records: WomensRecruitingProspect[],
): WomensRecruitingStatusSummary[] {
  if (!records.every((row) => typeof row.name === "string" && row.name.trim())) return [];
  const ids = records.map((row) => typeof row.athlete_id === "string" ? row.athlete_id.trim() : "");
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return [];
  const byStatus = new Map<string, { prospects: number; graded: number; gradeTotal: number; exactIds: number; destinationIds: number }>();
  records.forEach((row) => {
    const status = row.status?.trim() || "Status unavailable";
    const grade = typeof row.grade === "number" && Number.isFinite(row.grade) ? row.grade : null;
    const current = byStatus.get(status) || { prospects: 0, graded: 0, gradeTotal: 0, exactIds: 0, destinationIds: 0 };
    current.prospects += 1;
    current.exactIds += 1;
    if (grade != null) {
      current.graded += 1;
      current.gradeTotal += grade;
    }
    if (row.committed_team_id?.trim()) current.destinationIds += 1;
    byStatus.set(status, current);
  });
  return Array.from(byStatus.entries())
    .map(([status, value]) => ({
      status,
      prospects: value.prospects,
      graded: value.graded,
      averageGrade: value.graded > 0 ? value.gradeTotal / value.graded : null,
      exactIds: value.exactIds,
      destinationIds: value.destinationIds,
    }))
    .sort((left, right) => right.prospects - left.prospects || left.status.localeCompare(right.status));
}

/**
 * Rank only retained source rows for the women’s recruiting context panel.
 * This is a production shortlist, not a recruiting ranking: missing metric
 * values remain unavailable and never become zeroes or inferred grades.
 */
export function rankWomensObservedPlayers(
  players: WomensObservedPlayer[],
  metric: WomensObservedMetric,
  limit = 12,
): Array<WomensObservedPlayer & { metricValue: number | null }> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
  return players
    .map((player) => ({ ...player, metricValue: womensPlayerStatValue(player.stats, metric) }))
    .sort((left, right) => {
      const leftValue = left.metricValue ?? -Infinity;
      const rightValue = right.metricValue ?? -Infinity;
      return rightValue - leftValue || left.name.localeCompare(right.name) || left.player_id.localeCompare(right.player_id);
    })
    .slice(0, safeLimit);
}
