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
  height_inches?: number | null;
  weight_pounds?: number | null;
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

export type WomensRecruitingPositionSupply = {
  position: string;
  prospects: number;
  destinationIds: number;
  statuses: Array<{ status: string; prospects: number }>;
};

export type WomensRecruitingGradeBand = {
  label: string;
  minimum: number | null;
  maximum: number | null;
  prospects: number;
  share: number | null;
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

export type WomensRecruitingHistory = {
  schema_version: 1;
  sport: "basketball";
  gender: "women";
  classes: number[];
  edition: string;
  captured_at: string;
  coverage: {
    seasons: number;
    prospects: number;
    graded: number;
    ranked: number;
    committed: number;
  };
  releases: WomensRecruitingRelease[];
};

export const womensRecruitingProspectCsvHeaders = [
  "athlete_id",
  "name",
  "recruiting_class",
  "position",
  "national_rank",
  "grade",
  "status",
  "committed_team_id",
  "committed_team_name",
  "high_school",
  "hometown",
] as const;

/** Export only fields present in the validated prospect release. */
export function womensRecruitingProspectCsvRows(
  records: readonly WomensRecruitingProspect[],
  recruitingClass: number,
): Array<Array<string | number | null>> {
  return records.map((record) => [
    record.athlete_id,
    record.name,
    recruitingClass,
    record.position ?? null,
    record.rank ?? null,
    record.grade ?? null,
    record.status ?? null,
    record.committed_team_id ?? null,
    record.committed_team_name ?? null,
    record.high_school ?? null,
    record.hometown ?? null,
  ]);
}

const releaseDigest = /^[a-f0-9]{64}$/i;
const sourceId = /^\d{1,15}$/;
const httpsUrl = /^https:\/\/[^\s]+$/i;

/** Keep the ESPN-labelled release tied to ESPN's public API host. */
function isEspnRecruitingUrl(value: unknown): value is string {
  if (typeof value !== "string" || !httpsUrl.test(value)) return false;
  try {
    const url = new URL(value);
    return url.hostname === "sports.core.api.espn.com"
      && url.pathname.startsWith("/v2/sports/basketball/leagues/womens-college-basketball/");
  } catch {
    return false;
  }
}

type ValidatedSource = WomensRecruitingRelease["source"];

function validateSource(value: unknown, season: number, recordCount: number): ValidatedSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const listUrl = typeof source.list_url === "string" ? source.list_url.trim() : "";
  const detailUrlTemplate = typeof source.detail_url_template === "string" ? source.detail_url_template.trim() : "";
  const receiptCount = source.receipt_count;
  if (source.publisher !== "ESPN" || source.league !== "womens-college-basketball") return null;
  if (!isEspnRecruitingUrl(listUrl) || !listUrl.includes(`/seasons/${season}/recruits`)) return null;
  if (!isEspnRecruitingUrl(detailUrlTemplate) || !detailUrlTemplate.includes("/recruits/{athlete_id}")) return null;
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
    if (!releaseDigest.test(sourceSha256) || !isEspnRecruitingUrl(sourceUrl)
      || sourceUrl !== source.detail_url_template.replace("{athlete_id}", athleteId)
      || record.recruiting_class !== season
      || recordCapturedAt !== capturedAt
      || Number.isNaN(Date.parse(recordCapturedAt))) return null;
    const grade = record.grade == null ? null : record.grade;
    const rank = record.rank == null ? null : record.rank;
    if (grade != null && (typeof grade !== "number" || !Number.isFinite(grade) || grade < 0)) return null;
    if (rank != null && (typeof rank !== "number" || !Number.isSafeInteger(rank) || rank <= 0)) return null;
    const height = record.height_inches == null ? null : record.height_inches;
    const weight = record.weight_pounds == null ? null : record.weight_pounds;
    if (height != null && (typeof height !== "number" || !Number.isFinite(height) || height < 0)) return null;
    if (weight != null && (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0)) return null;
    ids.add(athleteId);
    records.push({
      athlete_id: athleteId,
      name,
      position: typeof record.position === "string" && record.position.trim() ? record.position.trim() : null,
      grade: grade as number | null,
      rank: rank as number | null,
      height_inches: height as number | null,
      weight_pounds: weight as number | null,
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

/**
 * Validate the multi-class index without collapsing source rows into a
 * cross-class ranking. Each class must pass the same exact-ID and receipt
 * checks as the standalone release, and aggregate counts must reconcile.
 */
export function validateWomensRecruitingHistory(value: unknown): WomensRecruitingHistory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.schema_version !== 1 || payload.sport !== "basketball" || payload.gender !== "women") return null;
  const edition = typeof payload.edition === "string" ? payload.edition.trim().toLowerCase() : "";
  const capturedAt = typeof payload.captured_at === "string" ? payload.captured_at.trim() : "";
  if (!releaseDigest.test(edition) || !capturedAt || Number.isNaN(Date.parse(capturedAt))) return null;
  const rawReleases = payload.releases;
  const rawClasses = payload.classes;
  if (!Array.isArray(rawReleases) || rawReleases.length === 0 || !Array.isArray(rawClasses) || rawClasses.length !== rawReleases.length) return null;
  const releases = rawReleases.map(validateWomensRecruitingRelease);
  if (releases.some((release): release is null => release === null)) return null;
  const validReleases = releases as WomensRecruitingRelease[];
  const classes = rawClasses.map((item) => Number(item));
  if (classes.some((item) => !Number.isSafeInteger(item) || item < 2025 || item > 2035)
    || new Set(classes).size !== classes.length
    || validReleases.some((release, index) => release.season !== classes[index])) return null;
  const rawCoverage = payload.coverage;
  if (!rawCoverage || typeof rawCoverage !== "object" || Array.isArray(rawCoverage)) return null;
  const coverage = rawCoverage as Record<string, unknown>;
  const count = (key: string) => Number.isSafeInteger(coverage[key]) && Number(coverage[key]) >= 0 ? Number(coverage[key]) : null;
  const measured = {
    seasons: validReleases.length,
    prospects: validReleases.reduce((sum, release) => sum + release.coverage.prospects, 0),
    graded: validReleases.reduce((sum, release) => sum + release.coverage.graded, 0),
    ranked: validReleases.reduce((sum, release) => sum + release.coverage.ranked, 0),
    committed: validReleases.reduce((sum, release) => sum + release.coverage.committed, 0),
  };
  if (Object.keys(measured).some((key) => count(key) !== measured[key as keyof typeof measured])) return null;
  return {
    schema_version: 1,
    sport: "basketball",
    gender: "women",
    classes,
    edition,
    captured_at: capturedAt,
    coverage: measured,
    releases: validReleases,
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
 * Describe the source grade distribution without converting grades into a
 * Silvermine ranking. Missing grades remain in their own bucket and every
 * share uses the supplied release rows as its denominator.
 */
export function womensRecruitingGradeBands(
  records: WomensRecruitingProspect[],
): WomensRecruitingGradeBand[] {
  const bands: Array<Omit<WomensRecruitingGradeBand, "prospects" | "share">> = [
    { label: "95–100", minimum: 95, maximum: 100 },
    { label: "90–94.9", minimum: 90, maximum: 94.999999 },
    { label: "80–89.9", minimum: 80, maximum: 89.999999 },
    { label: "Below 80", minimum: null, maximum: 79.999999 },
    { label: "Grade unavailable", minimum: null, maximum: null },
  ];
  const counts = bands.map(() => 0);
  records.forEach((record) => {
    const grade = record.grade;
    const index = typeof grade !== "number" || !Number.isFinite(grade)
      ? bands.length - 1
      : grade >= 95
        ? 0
        : grade >= 90
          ? 1
          : grade >= 80
            ? 2
            : 3;
    counts[index] += 1;
  });
  const denominator = records.length;
  return bands.map((band, index) => ({
    ...band,
    prospects: counts[index],
    share: denominator > 0 ? counts[index] / denominator : null,
  }));
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
 * Build a compact position-by-status census from one exact-ID prospect
 * release. Source status language remains a label only: it is never promoted
 * to a commitment or destination when the release carries no team ID.
 */
export function womensRecruitingPositionSupply(
  records: WomensRecruitingProspect[],
): WomensRecruitingPositionSupply[] {
  if (!records.every((row) => typeof row.name === "string" && row.name.trim())) return [];
  const ids = records.map((row) => typeof row.athlete_id === "string" ? row.athlete_id.trim() : "");
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return [];

  const positions = new Map<string, { prospects: number; destinationIds: number; statuses: Map<string, number> }>();
  records.forEach((row) => {
    const position = row.position?.trim().toUpperCase() || "Position unavailable";
    const status = row.status?.trim() || "Status unavailable";
    const current = positions.get(position) || { prospects: 0, destinationIds: 0, statuses: new Map<string, number>() };
    current.prospects += 1;
    if (row.committed_team_id?.trim()) current.destinationIds += 1;
    current.statuses.set(status, (current.statuses.get(status) || 0) + 1);
    positions.set(position, current);
  });

  return Array.from(positions.entries())
    .map(([position, value]) => ({
      position,
      prospects: value.prospects,
      destinationIds: value.destinationIds,
      statuses: Array.from(value.statuses.entries())
        .map(([status, prospects]) => ({ status, prospects }))
        .sort((left, right) => right.prospects - left.prospects || left.status.localeCompare(right.status)),
    }))
    .sort((left, right) => right.prospects - left.prospects || left.position.localeCompare(right.position));
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
