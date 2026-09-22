import type { BBRoster, BBRosters } from "./basketball-types";

export type AnnouncementSource = {
  id: string;
  team_id: string;
  url: string;
  title: string;
  publisher: string;
  published_on: string;
  date_basis: string;
  checked_at: string;
  review_note: string | null;
  source_sha256?: string;
};
export type RecruitingPerson = {
  key: string;
  name: string;
  team_id: string;
  category: "transfer" | "freshman" | "international";
  previous_program: string | null;
  stats: null | {
    id: string;
    team_id: string;
    team: string;
    season: number;
    games: number;
    mpg: number;
    ppg: number | null;
    rpg: number | null;
    apg: number | null;
    spg: number | null;
    bpg: number | null;
    topg: number | null;
    efg: number | null;
    ts: number | null;
    three_pct: number | null;
    ft_pct: number | null;
    ft_rate: number | null;
    three_rate: number | null;
    tov_rate: number | null;
    incomplete_box_games: number;
    identity_basis: string;
  };
};
export type AnnouncementEvent = {
  id: string;
  person_key: string;
  kind: "addition" | "redshirt_announced" | "season_unavailable";
  source_id: string;
  summary: string;
};
export type RecruitingRelease = {
  season: number;
  edition: string;
  reviewed_at: string;
  methodology: string;
  coverage: {
    programs: number;
    players: number;
    events: number;
    sources: number;
    historical_links: number;
    complete_national_coverage: false;
  };
  programs: { id: string; name: string; host: string; publisher: string }[];
  people: RecruitingPerson[];
  sources: AnnouncementSource[];
  events: AnnouncementEvent[];
  review_queue?: RecruitingReviewQueue;
  stats_source?: {
    publisher: string;
    url: string;
    license: string;
    season: number;
    release_sha256: string;
  };
};

export type RecruitingReviewQueueRow = {
  team_id: string;
  team: string;
  evidence_status: "reviewed" | "roster_observation";
  listed_players: number;
  returning_players: number;
  transfer_players: number;
  new_players: number;
  ambiguous_players: number;
  prior_minutes: number;
  returning_minutes: number;
  incoming_prior_minutes: number;
  represented_prior_minutes: number;
  unrepresented_prior_minutes: number;
  returning_minutes_share: number | null;
  represented_prior_minutes_share: number | null;
  review_priority: "covered" | "urgent" | "high" | "identity_check" | "monitor";
  review_reason: string;
};

export type RecruitingReviewQueue = {
  season: number;
  source_dataset: string;
  source_captured_at: string;
  source_sha256: string;
  reviewed_programs: number;
  source_reviewed_programs: number;
  reviewed_not_observed_programs: number;
  observed_programs: number;
  unreviewed_programs: number;
  rows: RecruitingReviewQueueRow[];
};

const recruitingCategories = new Set<RecruitingPerson["category"]>(["transfer", "freshman", "international"]);
const recruitingEventKinds = new Set<AnnouncementEvent["kind"]>(["addition", "redshirt_announced", "season_unavailable"]);
const nonnegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nullableFinite = (value: unknown): value is number | null => value == null || (typeof value === "number" && Number.isFinite(value));
const nonnegativeFinite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Validate a live reviewed release before it can replace the bundled edition.
 * Source IDs, person keys and program IDs must reconcile as one graph; a bad
 * row invalidates the packet instead of silently changing recruiting counts.
 */
export function parseRecruitingRelease(value: unknown, expectedSeason = 2027): RecruitingRelease | null {
  const payload = objectRecord(value);
  const coverage = objectRecord(payload?.coverage);
  if (!payload || !coverage
    || payload.season !== expectedSeason
    || typeof payload.edition !== "string" || !/^[a-f0-9]{64}$/i.test(payload.edition)
    || typeof payload.reviewed_at !== "string" || !Number.isFinite(Date.parse(payload.reviewed_at))
    || typeof payload.methodology !== "string"
    || coverage.complete_national_coverage !== false
    || !Array.isArray(payload.programs) || !Array.isArray(payload.sources)
    || !Array.isArray(payload.people) || !Array.isArray(payload.events)
    || !nonnegativeInteger(coverage.programs) || !nonnegativeInteger(coverage.players)
    || !nonnegativeInteger(coverage.events) || !nonnegativeInteger(coverage.sources)
    || !nonnegativeInteger(coverage.historical_links)) return null;

  const programs: RecruitingRelease["programs"] = [];
  const programIds = new Set<string>();
  for (const candidate of payload.programs) {
    const row = objectRecord(candidate);
    const id = row?.id == null ? "" : String(row.id).trim();
    if (!row || !id || typeof row.name !== "string" || !row.name.trim() || programIds.has(id)) return null;
    programIds.add(id);
    programs.push({ id, name: row.name, host: typeof row.host === "string" ? row.host : "", publisher: typeof row.publisher === "string" ? row.publisher : "" });
  }

  const sources: RecruitingRelease["sources"] = [];
  const sourceIds = new Set<string>();
  for (const candidate of payload.sources) {
    const row = objectRecord(candidate);
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    const teamId = row?.team_id == null ? "" : String(row.team_id).trim();
    const digest = row?.source_sha256;
    if (!row || !id || sourceIds.has(id) || !programIds.has(teamId)
      || typeof row.published_on !== "string" || !Number.isFinite(Date.parse(row.published_on))
      || typeof row.checked_at !== "string" || !Number.isFinite(Date.parse(row.checked_at))
      || typeof digest !== "string" || !/^[a-f0-9]{64}$/i.test(digest)) return null;
    sourceIds.add(id);
    sources.push({
      id,
      team_id: teamId,
      url: typeof row.url === "string" ? row.url : "",
      title: typeof row.title === "string" ? row.title : "",
      publisher: typeof row.publisher === "string" ? row.publisher : "",
      published_on: row.published_on,
      date_basis: typeof row.date_basis === "string" ? row.date_basis : "",
      checked_at: row.checked_at,
      review_note: row.review_note == null || typeof row.review_note === "string" ? row.review_note ?? null : null,
      source_sha256: digest.toLowerCase(),
    });
  }

  const people: RecruitingRelease["people"] = [];
  const personKeys = new Set<string>();
  let historicalLinks = 0;
  for (const candidate of payload.people) {
    const row = objectRecord(candidate);
    if (!row || typeof row.key !== "string" || !row.key.trim() || personKeys.has(row.key)
      || typeof row.name !== "string" || !row.name.trim()
      || typeof row.team_id !== "string" || !programIds.has(row.team_id)
      || typeof row.category !== "string" || !recruitingCategories.has(row.category as RecruitingPerson["category"])
      || (row.previous_program != null && typeof row.previous_program !== "string")) return null;
    const stats = row.stats;
    if (stats != null) {
      const statRow = objectRecord(stats);
      if (!statRow || typeof statRow.id !== "string" || !statRow.id.trim() || typeof statRow.team_id !== "string" || !statRow.team_id.trim()
        || typeof statRow.team !== "string" || !statRow.team.trim() || !nonnegativeInteger(statRow.season)
        || !nonnegativeInteger(statRow.games) || !nullableFinite(statRow.mpg) || !nullableFinite(statRow.ppg)
        || !nullableFinite(statRow.rpg) || !nullableFinite(statRow.apg) || !nullableFinite(statRow.spg)
        || !nullableFinite(statRow.bpg) || !nullableFinite(statRow.topg) || !nullableFinite(statRow.efg)
        || !nullableFinite(statRow.ts) || !nullableFinite(statRow.three_pct) || !nullableFinite(statRow.ft_pct)
        || !nullableFinite(statRow.ft_rate) || !nullableFinite(statRow.three_rate) || !nullableFinite(statRow.tov_rate)
        || !nonnegativeInteger(statRow.incomplete_box_games) || typeof statRow.identity_basis !== "string" || !statRow.identity_basis.trim()) return null;
      historicalLinks += 1;
    }
    personKeys.add(row.key);
    people.push(row as unknown as RecruitingPerson);
  }

  const events: RecruitingRelease["events"] = [];
  const eventIds = new Set<string>();
  for (const candidate of payload.events) {
    const row = objectRecord(candidate);
    if (!row || typeof row.id !== "string" || !row.id.trim() || eventIds.has(row.id)
      || typeof row.person_key !== "string" || !personKeys.has(row.person_key)
      || typeof row.source_id !== "string" || !sourceIds.has(row.source_id)
      || typeof row.kind !== "string" || !recruitingEventKinds.has(row.kind as AnnouncementEvent["kind"])
      || typeof row.summary !== "string" || !row.summary.trim()) return null;
    const person = people.find((candidatePerson) => candidatePerson.key === row.person_key)!;
    const source = sources.find((candidateSource) => candidateSource.id === row.source_id)!;
    if (person.team_id !== source.team_id) return null;
    eventIds.add(row.id);
    events.push(row as unknown as AnnouncementEvent);
  }
  let reviewQueue: RecruitingReviewQueue | undefined;
  if (payload.review_queue !== undefined) {
    const queue = objectRecord(payload.review_queue);
    const queueRows = queue?.rows;
    const sourceSha = queue?.source_sha256;
    const sourceCaptured = queue?.source_captured_at;
    const sourceDataset = queue?.source_dataset;
    if (!queue
      || queue.season !== expectedSeason
      || typeof sourceDataset !== "string" || !sourceDataset.trim()
      || typeof sourceCaptured !== "string" || !Number.isFinite(Date.parse(sourceCaptured))
      || typeof sourceSha !== "string" || !/^[a-f0-9]{64}$/i.test(sourceSha)
      || !nonnegativeInteger(queue.reviewed_programs)
      || !nonnegativeInteger(queue.source_reviewed_programs)
      || !nonnegativeInteger(queue.reviewed_not_observed_programs)
      || !nonnegativeInteger(queue.observed_programs)
      || !nonnegativeInteger(queue.unreviewed_programs)
      || queue.observed_programs !== (Array.isArray(queueRows) ? queueRows.length : -1)
      || queue.reviewed_programs + queue.unreviewed_programs !== queue.observed_programs
      || queue.reviewed_programs + queue.reviewed_not_observed_programs !== queue.source_reviewed_programs
      || !Array.isArray(queueRows)) return null;
    const reviewedPrograms = queue.reviewed_programs;
    const sourceReviewedPrograms = queue.source_reviewed_programs;
    const reviewedNotObservedPrograms = queue.reviewed_not_observed_programs;
    const observedPrograms = queue.observed_programs;
    const unreviewedPrograms = queue.unreviewed_programs;
    const seenQueuePrograms = new Set<string>();
    const normalizedRows: RecruitingReviewQueueRow[] = [];
    for (const candidateRow of queueRows) {
      const row = objectRecord(candidateRow);
      const teamId = row?.team_id == null ? "" : String(row.team_id).trim();
      const evidenceStatus = row?.evidence_status;
      const returningShare = row?.returning_minutes_share;
      const representedShare = row?.represented_prior_minutes_share;
      const reviewPriority = row?.review_priority;
      const numericFields = [
        "listed_players", "returning_players", "transfer_players", "new_players", "ambiguous_players",
        "prior_minutes", "returning_minutes", "incoming_prior_minutes", "represented_prior_minutes",
        "unrepresented_prior_minutes",
      ];
      if (!row || !teamId || seenQueuePrograms.has(teamId)
        || typeof row.team !== "string" || !row.team.trim()
        || (evidenceStatus !== "reviewed" && evidenceStatus !== "roster_observation")
        || numericFields.some((field) => !nonnegativeFinite(row[field]))
        || !["covered", "urgent", "high", "identity_check", "monitor"].includes(String(reviewPriority))
        || typeof row.review_reason !== "string" || !row.review_reason.trim()
        || !nullableFinite(returningShare) || !nullableFinite(representedShare)
        || (returningShare != null && (returningShare < 0 || returningShare > 1))
        || (representedShare != null && (representedShare < 0 || representedShare > 1))) return null;
      seenQueuePrograms.add(teamId);
      normalizedRows.push({
        team_id: teamId,
        team: row.team,
        evidence_status: evidenceStatus,
        listed_players: Number(row.listed_players),
        returning_players: Number(row.returning_players),
        transfer_players: Number(row.transfer_players),
        new_players: Number(row.new_players),
        ambiguous_players: Number(row.ambiguous_players),
        prior_minutes: Number(row.prior_minutes),
        returning_minutes: Number(row.returning_minutes),
        incoming_prior_minutes: Number(row.incoming_prior_minutes),
        represented_prior_minutes: Number(row.represented_prior_minutes),
        unrepresented_prior_minutes: Number(row.unrepresented_prior_minutes),
        returning_minutes_share: returningShare == null ? null : Number(returningShare),
        represented_prior_minutes_share: representedShare == null ? null : Number(representedShare),
        review_priority: reviewPriority as RecruitingReviewQueueRow["review_priority"],
        review_reason: row.review_reason,
      });
    }
    const reviewedRows = normalizedRows.filter((row) => row.evidence_status === "reviewed").length;
    if (reviewedRows !== reviewedPrograms) return null;
    reviewQueue = {
      season: expectedSeason,
      source_dataset: sourceDataset,
      source_captured_at: sourceCaptured,
      source_sha256: sourceSha.toLowerCase(),
      reviewed_programs: reviewedPrograms,
      source_reviewed_programs: sourceReviewedPrograms,
      reviewed_not_observed_programs: reviewedNotObservedPrograms,
      observed_programs: observedPrograms,
      unreviewed_programs: unreviewedPrograms,
      rows: normalizedRows,
    };
  }
  if (coverage.programs !== programs.length || coverage.players !== people.length || coverage.events !== events.length
    || coverage.sources !== sources.length || coverage.historical_links !== historicalLinks) return null;
  return { ...payload, programs, sources, people, events, review_queue: reviewQueue } as unknown as RecruitingRelease;
}
export const categoryLabels = {
  transfer: "College transfer",
  freshman: "Prep addition",
  international: "International addition",
};
export const eventLabels = {
  addition: "Addition announced",
  redshirt_announced: "Redshirt announced",
  season_unavailable: "Season unavailable",
};
export type RecruitingSort = "latest" | "ppg" | "mpg" | "name" | "review";
export type RecruitingFilters = {
  team: string;
  q: string;
  kind: string;
  sort: RecruitingSort;
};
export type RecruitingCoverageSort = "reviewed" | "prior" | "unrepresented" | "latest" | "name";
export type RecruitingCoverageStatus = "all" | "reviewed" | "unreviewed";
export type RecruitingCoverageFilters = {
  query: string;
  sort: RecruitingCoverageSort;
  status: RecruitingCoverageStatus;
};
export type RecruitingProgramSummary = {
  team_id: string;
  team_name: string;
  additions: number;
  transfers: number;
  linked_profiles: number;
  prior_ppg: number;
  prior_mpg: number;
  high_workload: number;
};

export type RecruitingRosterProductionPlayer = {
  name: string;
  player_id: string | null;
  prior_team_id: string | null;
  prior_team: string | null;
  season: number | null;
  games: number | null;
  minutes: number | null;
  mpg: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  ts: number | null;
  box_bpm: number | null;
  availability: AnnouncementEvent["kind"] | "same_program";
};

export type RecruitingRosterProductionComparison = {
  team_id: string;
  team_name: string;
  incoming_players: number;
  incoming_linked: number;
  returning_players: number;
  returning_linked: number;
  incoming: RecruitingRosterProductionPlayer | null;
  returning: RecruitingRosterProductionPlayer | null;
};

const recruitingProductionEvidenceFields = ["mpg", "ppg", "rpg", "apg", "ts"] as const;

/** Count only finite recorded production fields; missing values stay missing. */
export function recruitingProductionEvidenceCoverage(
  player: Pick<RecruitingRosterProductionPlayer, "mpg" | "ppg" | "rpg" | "apg" | "ts">,
) {
  const available = recruitingProductionEvidenceFields.filter((field) => {
    const value = player[field];
    return typeof value === "number" && Number.isFinite(value);
  }).length;
  return { available, total: recruitingProductionEvidenceFields.length };
}

/** Compare two recorded production values without imputing missing evidence. */
export function recruitingProductionDifference(
  incoming: number | null | undefined,
  returning: number | null | undefined,
) {
  return typeof incoming === "number" && Number.isFinite(incoming)
    && typeof returning === "number" && Number.isFinite(returning)
    ? incoming - returning
    : null;
}

const recruitingKinds = new Set([
  "all",
  ...Object.keys(categoryLabels),
  "availability",
]);
const recruitingSorts = new Set<RecruitingSort>([
  "latest",
  "ppg",
  "mpg",
  "name",
  "review",
]);
const recruitingCoverageSorts = new Set<RecruitingCoverageSort>([
  "reviewed",
  "prior",
  "unrepresented",
  "latest",
  "name",
]);
const recruitingCoverageStatuses = new Set<RecruitingCoverageStatus>([
  "all",
  "reviewed",
  "unreviewed",
]);

/** Read only supported recruiting filters from a shareable query string. */
export function parseRecruitingFilters(search: string): RecruitingFilters {
  const params = new URLSearchParams(search);
  const sort = params.get("sort") as RecruitingSort | null;
  const kind = params.get("kind") || "all";
  return {
    team: params.get("team") || "all",
    q: params.get("q") || "",
    kind: recruitingKinds.has(kind) ? kind : "all",
    sort: sort && recruitingSorts.has(sort) ? sort : "latest",
  };
}

/** Read the program coverage-map controls from a shareable query string. */
export function parseRecruitingCoverageFilters(
  search: string,
): RecruitingCoverageFilters {
  const params = new URLSearchParams(search);
  const sort = params.get("coverageSort") as RecruitingCoverageSort | null;
  const status = params.get("coverageStatus") as RecruitingCoverageStatus | null;
  return {
    query: params.get("coverageQ") || "",
    sort: sort && recruitingCoverageSorts.has(sort) ? sort : "reviewed",
    status: status && recruitingCoverageStatuses.has(status) ? status : "all",
  };
}

/** Serialize non-default recruiting filters for a compact shareable URL. */
export function recruitingFilterSearch(
  filters: RecruitingFilters,
  coverage?: RecruitingCoverageFilters,
) {
  const params = new URLSearchParams();
  if (filters.team !== "all") params.set("team", filters.team);
  if (filters.q) params.set("q", filters.q);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.sort !== "latest") params.set("sort", filters.sort);
  if (coverage?.query) params.set("coverageQ", coverage.query);
  if (coverage && coverage.sort !== "reviewed") {
    params.set("coverageSort", coverage.sort);
  }
  if (coverage && coverage.status !== "all") {
    params.set("coverageStatus", coverage.status);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
type RecruitingSortable = {
  name: string;
  latest: { source: { published_on: string } };
  stats: { ppg: number | null; mpg: number | null } | null;
};

/**
 * Put the records needing a human check first without turning the board into
 * a hidden recruiting grade. The order is only an evidence triage rule:
 * later non-addition statements, exact roster handoffs, linked production,
 * then prior workload and publication date.
 */
export function sortRecruitingReviewRows<
  T extends RecruitingSortable & {
    team_id: string;
    latest: RecruitingSortable["latest"] & { kind: string };
  },
>(rows: T[], match: (row: T) => RosterNameMatch) {
  const matchRank: Record<RosterNameMatch, number> = { exact: 2, multiple: 1, none: 0 };
  return [...rows].sort((a, b) => {
    const attention = (row: T) => [
      row.latest.kind === "addition" ? 0 : 1,
      matchRank[match(row)],
      row.stats ? 1 : 0,
      row.stats?.mpg ?? -1,
      row.latest.source.published_on,
    ];
    const av = attention(a);
    const bv = attention(b);
    for (let i = 0; i < 4; i += 1) {
      if (av[i] !== bv[i]) return Number(bv[i]) - Number(av[i]);
    }
    if (av[4] !== bv[4]) return String(bv[4]).localeCompare(String(av[4]));
    return a.name.localeCompare(b.name);
  });
}

export function sortRecruitingRows<T extends RecruitingSortable>(
  rows: T[],
  sort: RecruitingSort,
) {
  return [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "latest") {
      return (
        b.latest.source.published_on.localeCompare(
          a.latest.source.published_on,
        ) || a.name.localeCompare(b.name)
      );
    }
    if (sort === "review") return a.name.localeCompare(b.name);
    const av = a.stats?.[sort] ?? null;
    const bv = b.stats?.[sort] ?? null;
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av || a.name.localeCompare(b.name);
  });
}
export function recruitingRows(data: RecruitingRelease) {
  return data.people
    .map((person) => {
      const timeline = data.events
        .filter((e) => e.person_key === person.key)
        .map((e) => {
          const source = data.sources.find((s) => s.id === e.source_id);
          if (!source) throw Error("Missing announcement source");
          return { ...e, source };
        })
        .sort(
          (a, b) =>
            b.source.published_on.localeCompare(a.source.published_on) ||
            Number(a.kind === "addition") - Number(b.kind === "addition") ||
            a.id.localeCompare(b.id),
        );
      return {
        ...person,
        timeline,
        latest: timeline[0],
        program: data.programs.find((p) => p.id === person.team_id)!,
      };
    })
    .sort(
      (a, b) =>
        b.latest.source.published_on.localeCompare(
          a.latest.source.published_on,
        ) || a.name.localeCompare(b.name),
    );
}

export type RecruitingActivityEvent = {
  id: string;
  person_key: string;
  source_id: string;
  athlete_id: string | null;
  kind: AnnouncementEvent["kind"];
  summary: string;
  person_name: string;
  team_id: string;
  program_name: string;
  source: AnnouncementSource;
};

export type RecruitingActivityMonth = {
  month: string;
  events: number;
  players: number;
  programs: number;
  additions: number;
};

/** Build a dated activity feed and month rollup from the reviewed announcement release. */
export function summarizeRecruitingActivity(data: RecruitingRelease) {
  const events: RecruitingActivityEvent[] = recruitingRows(data)
    .flatMap((person) =>
      person.timeline.map((event) => ({
        id: event.id,
        person_key: event.person_key,
        source_id: event.source_id,
        athlete_id: person.stats?.id ?? null,
        kind: event.kind,
        summary: event.summary,
        person_name: person.name,
        team_id: person.team_id,
        program_name: person.program.name,
        source: event.source,
      })),
    )
    .sort(
      (a, b) =>
        b.source.published_on.localeCompare(a.source.published_on) ||
        a.id.localeCompare(b.id),
    );
  const monthMap = new Map<string, { events: number; players: Set<string>; programs: Set<string>; additions: number }>();
  for (const event of events) {
    const month = event.source.published_on.slice(0, 7);
    const summary = monthMap.get(month) ?? {
      events: 0,
      players: new Set<string>(),
      programs: new Set<string>(),
      additions: 0,
    };
    summary.events += 1;
    summary.players.add(event.person_name);
    summary.programs.add(event.team_id);
    if (event.kind === "addition") summary.additions += 1;
    monthMap.set(month, summary);
  }
  const months: RecruitingActivityMonth[] = [...monthMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, summary]) => ({
      month,
      events: summary.events,
      players: summary.players.size,
      programs: summary.programs.size,
      additions: summary.additions,
    }));
  return { events, months };
}

export type RosterNameMatch = "exact" | "multiple" | "none";

const normalizedName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();

/** Compare an announcement with the current source listing conservatively. */
export function rosterNameMatch(
  name: string,
  teamId: string,
  players: BBRoster[],
): RosterNameMatch {
  const key = normalizedName(name);
  const matches = players.filter(
    (player) =>
      player.team_id === teamId &&
      normalizedName(player.name) === key,
  );
  if (matches.length > 1) return "multiple";
  return matches.length ? "exact" : "none";
}

/** Aggregate linked prior production by announcing program for roster review. */
export function summarizeRecruitingPrograms(
  rows: Array<{
    team_id: string;
    category: RecruitingPerson["category"];
    program: { name: string };
    stats: RecruitingPerson["stats"];
  }>,
): RecruitingProgramSummary[] {
  const byTeam = new Map<string, RecruitingProgramSummary>();
  for (const row of rows) {
    const summary =
      byTeam.get(row.team_id) ?? {
        team_id: row.team_id,
        team_name: row.program.name,
        additions: 0,
        transfers: 0,
        linked_profiles: 0,
        prior_ppg: 0,
        prior_mpg: 0,
        high_workload: 0,
      };
    summary.additions += 1;
    if (row.category === "transfer") summary.transfers += 1;
    if (row.stats) {
      summary.linked_profiles += 1;
      if (row.stats.ppg != null) summary.prior_ppg += row.stats.ppg;
      if (row.stats.mpg != null) {
        summary.prior_mpg += row.stats.mpg;
        if (row.stats.mpg >= 20) summary.high_workload += 1;
      }
    }
    byTeam.set(row.team_id, summary);
  }
  return [...byTeam.values()].sort(
    (a, b) =>
      b.prior_mpg - a.prior_mpg ||
      b.linked_profiles - a.linked_profiles ||
      a.team_name.localeCompare(b.team_name),
  );
}

/**
 * Put reviewed additions and exact-ID same-program roster records on one
 * program row. The selected players are workload leaders from their own
 * evidence sets; missing historical links and missing production remain null.
 */
export function recruitingRosterProductionComparisons(
  data: RecruitingRelease,
  rosters: BBRosters,
): RecruitingRosterProductionComparison[] {
  const additions = recruitingRows(data);
  const workloadOrder = <T extends { name: string }>(
    rows: T[],
    production: (row: T) => { mpg: number | null; ppg: number | null; minutes: number | null } | null,
  ) => [...rows].sort((a, b) => {
    const ap = production(a);
    const bp = production(b);
    if (Boolean(ap) !== Boolean(bp)) return ap ? -1 : 1;
    return (
      (bp?.mpg ?? -1) - (ap?.mpg ?? -1) ||
      (bp?.minutes ?? -1) - (ap?.minutes ?? -1) ||
      (bp?.ppg ?? -1) - (ap?.ppg ?? -1) ||
      a.name.localeCompare(b.name)
    );
  });

  return data.programs
    .map((program) => {
      const programAdditions = additions.filter((row) => row.team_id === program.id);
      const programReturners = rosters.players.filter(
        (player) => player.team_id === program.id && player.status === "same_program",
      );
      const incomingRow = workloadOrder(programAdditions, (row) => row.stats
        ? { mpg: row.stats.mpg, ppg: row.stats.ppg, minutes: null }
        : null)[0] ?? null;
      const returningRow = workloadOrder(programReturners, (row) => row.prior_production
        ? {
            mpg: row.prior_production.mpg,
            ppg: row.prior_production.ppg,
            minutes: row.prior_production.minutes,
          }
        : null)[0] ?? null;
      return {
        team_id: program.id,
        team_name: program.name,
        incoming_players: programAdditions.length,
        incoming_linked: programAdditions.filter((row) => row.stats).length,
        returning_players: programReturners.length,
        returning_linked: programReturners.filter((row) => row.prior_production).length,
        incoming: incomingRow ? {
          name: incomingRow.name,
          player_id: incomingRow.stats?.id ?? null,
          prior_team_id: incomingRow.stats?.team_id ?? null,
          prior_team: incomingRow.stats?.team ?? incomingRow.previous_program,
          season: incomingRow.stats?.season ?? null,
          games: incomingRow.stats?.games ?? null,
          minutes: null,
          mpg: incomingRow.stats?.mpg ?? null,
          ppg: incomingRow.stats?.ppg ?? null,
          rpg: incomingRow.stats?.rpg ?? null,
          apg: incomingRow.stats?.apg ?? null,
          ts: incomingRow.stats?.ts ?? null,
          box_bpm: null,
          availability: incomingRow.latest.kind,
        } : null,
        returning: returningRow ? {
          name: returningRow.name,
          player_id: returningRow.id,
          prior_team_id: returningRow.team_id,
          prior_team: returningRow.team,
          season: rosters.previous_season,
          games: returningRow.prior_production?.games ?? null,
          minutes: returningRow.prior_production?.minutes ?? null,
          mpg: returningRow.prior_production?.mpg ?? null,
          ppg: returningRow.prior_production?.ppg ?? null,
          rpg: returningRow.prior_production?.rpg ?? null,
          apg: returningRow.prior_production?.apg ?? null,
          ts: returningRow.prior_production?.ts ?? null,
          box_bpm: returningRow.prior_production?.box_bpm ?? null,
          availability: "same_program",
        } : null,
      } satisfies RecruitingRosterProductionComparison;
    })
    .sort((a, b) =>
      (b.incoming?.mpg ?? -1) - (a.incoming?.mpg ?? -1) ||
      b.incoming_linked - a.incoming_linked ||
      (b.returning?.mpg ?? -1) - (a.returning?.mpg ?? -1) ||
      a.team_name.localeCompare(b.team_name),
    );
}

export function publicationDate(day: string) {
  return new Date(day.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
