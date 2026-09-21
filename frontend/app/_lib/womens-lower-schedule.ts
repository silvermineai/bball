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

const finiteScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isFinal(contest: WomensLowerScheduleContest) {
  return String(contest.state || contest.status || "").toLowerCase() === "f"
    || String(contest.status || "").toLowerCase() === "final";
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
      { team: home, score: home.score, opponent: away.score },
      { team: away, score: away.score, opponent: home.score },
    ];
    for (const row of rows) {
      const slug = String(row.team.slug || "").trim();
      const name = String(row.team.name || row.team.slug || "").trim();
      if (!slug && !name) continue;
      const key = slug || `name:${name.toLowerCase()}`;
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

