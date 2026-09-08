import type { BBRoster } from "./basketball-types";

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
  stats_source: {
    publisher: string;
    url: string;
    license: string;
    season: number;
    release_sha256: string;
  };
};
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
export type RecruitingCoverageSort = "reviewed" | "prior" | "name";
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

export function publicationDate(day: string) {
  return new Date(day.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
