export type WomensLowerScheduleTeam = {
  home?: boolean;
  slug?: string;
  name?: string;
  conference?: string;
  score?: number | null;
};

export type WomensLowerScheduleContest = {
  division: number;
  contest_id: number;
  contest_date?: string | null;
  state?: string | null;
  status?: string | null;
  teams: WomensLowerScheduleTeam[];
};

export type WomensLowerTeamRecord = {
  division: "2" | "3";
  team_key: string;
  team: string;
  slug: string | null;
  conference: string | null;
  games: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  margin: number;
  win_pct: number;
  rank: number;
};

export type WomensLowerScheduleEvidence = {
  division: "2" | "3";
  retained_contests: number;
  exact_two_team_contests: number;
  final_contests: number;
  scheduled_contests: number;
  postponed_contests: number;
  other_status_contests: number;
  unique_contest_ids: number;
  unique_team_slugs: number;
  team_sides: number;
  missing_team_slugs: number;
  first_date: string | null;
  last_date: string | null;
};

const finiteScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isFinal(contest: WomensLowerScheduleContest) {
  return String(contest.state || contest.status || "").toLowerCase() === "f"
    || String(contest.status || "").toLowerCase() === "final";
}

/**
 * Describe the retained source schedule without filling missing identities or
 * treating a scheduled row as a forecastable game. Contest IDs and team slugs
 * are counted exactly as published by NCAA; missing slugs remain visible.
 */
export function summarizeWomensLowerScheduleEvidence(
  contests: readonly WomensLowerScheduleContest[],
  division: "2" | "3",
): WomensLowerScheduleEvidence {
  const scoped = contests.filter((contest) => contest.division === Number(division));
  const exact = scoped.filter((contest) => Number.isInteger(contest.contest_id) && contest.teams.length === 2);
  const statusCounts = { final: 0, scheduled: 0, postponed: 0, other: 0 };
  const ids = new Set<number>();
  const slugs = new Set<string>();
  let teamSides = 0;
  let missingTeamSlugs = 0;
  const dates = exact
    .map((contest) => contest.contest_date || "")
    .filter(Boolean)
    .sort((left, right) => {
      const parse = (value: string) => {
        const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        return match ? match[3] + "-" + match[1] + "-" + match[2] : value;
      };
      return parse(left).localeCompare(parse(right));
    });
  for (const contest of exact) {
    ids.add(contest.contest_id);
    const state = String(contest.state || contest.status || "").toLowerCase();
    if (state === "f" || state === "final") statusCounts.final += 1;
    else if (state === "o" || state === "postponed") statusCounts.postponed += 1;
    else if (state === "p" || state === "pre" || state === "scheduled") statusCounts.scheduled += 1;
    else statusCounts.other += 1;
    for (const team of contest.teams) {
      teamSides += 1;
      const slug = String(team.slug || "").trim();
      if (slug) slugs.add(slug);
      else missingTeamSlugs += 1;
    }
  }
  return {
    division,
    retained_contests: scoped.length,
    exact_two_team_contests: exact.length,
    final_contests: statusCounts.final,
    scheduled_contests: statusCounts.scheduled,
    postponed_contests: statusCounts.postponed,
    other_status_contests: statusCounts.other,
    unique_contest_ids: ids.size,
    unique_team_slugs: slugs.size,
    team_sides: teamSides,
    missing_team_slugs: missingTeamSlugs,
    first_date: dates[0] || null,
    last_date: dates[dates.length - 1] || null,
  };
}

/**
 * Build a descriptive within-division record board from the exact NCAA
 * contest scope. Team slugs are the publisher identity; no name-only join or
 * cross-provider identity is introduced. Incomplete finals are excluded from
 * records rather than converted to zeroes.
 */
export function summarizeWomensLowerSchedule(
  contests: readonly WomensLowerScheduleContest[],
  division: "2" | "3",
): WomensLowerTeamRecord[] {
  const grouped = new Map<string, Omit<WomensLowerTeamRecord, "rank">>();
  for (const contest of contests) {
    if (contest.division !== Number(division) || !isFinal(contest) || contest.teams.length !== 2) continue;
    const home = contest.teams.find((team) => team.home === true) || contest.teams[0];
    const away = contest.teams.find((team) => team.home === false) || contest.teams[1];
    if (!home || !away || !finiteScore(home.score) || !finiteScore(away.score)) continue;
    const rows = [
      { side: "home", team: home, score: home.score, opponent: away.score },
      { side: "away", team: away, score: away.score, opponent: home.score },
    ];
    for (const row of rows) {
      const slug = String(row.team.slug || "").trim();
      const name = String(row.team.name || row.team.slug || "").trim();
      if (!slug && !name) continue;
      // A missing publisher slug is not a safe cross-game identity. Keep the
      // observation isolated to this contest side rather than merging by
      // display name, which could collapse two distinct teams.
      const key = slug || `contest:${contest.contest_id}:${row.side}`;
      const existing = grouped.get(key) || {
        division,
        team_key: key,
        team: name || "Team unavailable",
        slug: slug || null,
        conference: row.team.conference || null,
        games: 0,
        wins: 0,
        losses: 0,
        points_for: 0,
        points_against: 0,
        margin: 0,
        win_pct: 0,
      };
      existing.games += 1;
      existing.wins += row.score > row.opponent ? 1 : 0;
      existing.losses += row.score < row.opponent ? 1 : 0;
      existing.points_for += row.score;
      existing.points_against += row.opponent;
      existing.margin = (existing.points_for - existing.points_against) / existing.games;
      existing.win_pct = existing.games ? existing.wins / existing.games : 0;
      if (!existing.conference && row.team.conference) existing.conference = row.team.conference;
      if (name && existing.team === "Team unavailable") existing.team = name;
      grouped.set(key, existing);
    }
  }
  return [...grouped.values()]
    .sort((left, right) => right.win_pct - left.win_pct || right.margin - left.margin || right.points_for - left.points_for || left.team.localeCompare(right.team) || left.team_key.localeCompare(right.team_key))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
