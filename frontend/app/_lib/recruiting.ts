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
export type RecruitingSort = "latest" | "ppg" | "mpg" | "name";
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
type RecruitingSortable = {
  name: string;
  latest: { source: { published_on: string } };
  stats: { ppg: number | null; mpg: number | null } | null;
};

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
