export type MensLowerDivision = "2" | "3";

export type MensLowerScheduleTeam = {
  home?: boolean;
  name?: string;
  slug?: string | null;
  conference?: string | null;
  score?: number | null;
  winner?: boolean | null;
};

export type MensLowerScheduleContest = {
  division: number;
  contest_id: number;
  contest_date?: string | null;
  start_time?: string | null;
  state?: string | null;
  status?: string | null;
  teams: MensLowerScheduleTeam[];
};

export type MensLowerDivisionStanding = {
  team_key: string;
  name: string;
  slug: string | null;
  conference: string | null;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  win_pct: number | null;
};

export type MensLowerScheduleAsset = {
  generated_at?: string;
  source?: {
    season_year?: number;
    identity_limit?: string;
  };
  calendar?: Array<{ division: number; contest_date: string; count: number }>;
  contests?: MensLowerScheduleContest[];
  receipts?: Array<{ sha256?: string; url?: string }>;
};

export const parseMensLowerScheduleDate = (value?: string | null): number | null => {
  if (!value) return null;
  const mmddyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const parsed = mmddyyyy
    ? Date.parse(`${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}T23:59:59Z`)
    : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function scopedMensLowerSchedule(
  asset: MensLowerScheduleAsset,
  division: MensLowerDivision,
): MensLowerScheduleContest[] {
  return (asset.contests || [])
    .filter((contest) => contest.division === Number(division)
      && Number.isInteger(contest.contest_id)
      && Array.isArray(contest.teams)
      && contest.teams.length === 2)
    .sort((left, right) => (parseMensLowerScheduleDate(left.contest_date) ?? Number.POSITIVE_INFINITY)
      - (parseMensLowerScheduleDate(right.contest_date) ?? Number.POSITIVE_INFINITY)
      || left.contest_id - right.contest_id);
}

export function upcomingMensLowerSchedule(
  asset: MensLowerScheduleAsset,
  division: MensLowerDivision,
  now = Date.now(),
): MensLowerScheduleContest[] {
  return scopedMensLowerSchedule(asset, division).filter((contest) => {
    const date = parseMensLowerScheduleDate(contest.contest_date);
    return date != null && date >= now;
  });
}

/**
 * Derive a within-division table from exact contest IDs and final scores.
 * Missing scores, malformed team pairs, and non-final rows are withheld rather
 * than treated as zeroes. The publisher slug is the identity key; display
 * names are retained as reported and never joined to another provider.
 */
export function mensLowerDivisionStandings(
  asset: MensLowerScheduleAsset,
  division: MensLowerDivision,
): MensLowerDivisionStanding[] {
  type Accumulator = Omit<MensLowerDivisionStanding, "win_pct">;
  const rows = new Map<string, Accumulator>();
  const final = (value?: string | null) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return normalized === "f" || normalized.includes("final");
  };
  const score = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value) ? value : null;
  for (const contest of scopedMensLowerSchedule(asset, division)) {
    if (!final(contest.state) && !final(contest.status)) continue;
    const home = contest.teams.find((team) => team.home === true) || contest.teams[0];
    const away = contest.teams.find((team) => team.home === false) || contest.teams[1];
    if (!home || !away) continue;
    const homeScore = score(home.score);
    const awayScore = score(away.score);
    if (homeScore == null || awayScore == null) continue;
    const identity = (team: MensLowerScheduleTeam, fallback: string) => {
      const slug = typeof team.slug === "string" && team.slug.trim() ? team.slug.trim() : null;
      const name = typeof team.name === "string" && team.name.trim() ? team.name.trim() : null;
      // A missing publisher slug is not a safe cross-game identity. Keep that
      // observation isolated to its contest rather than merging by display
      // name, which could collapse two different teams with the same name.
      const key = slug ? `slug:${slug}` : fallback;
      return { key, slug, name: name || slug || "Team unavailable" };
    };
    const add = (team: MensLowerScheduleTeam, pointsFor: number, pointsAgainst: number, fallback: string) => {
      const identityValue = identity(team, fallback);
      const current = rows.get(identityValue.key) || {
        team_key: identityValue.key,
        name: identityValue.name,
        slug: identityValue.slug,
        conference: typeof team.conference === "string" && team.conference.trim() ? team.conference.trim() : null,
        games: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points_for: 0,
        points_against: 0,
        point_diff: 0,
      };
      current.games += 1;
      current.points_for += pointsFor;
      current.points_against += pointsAgainst;
      current.point_diff += pointsFor - pointsAgainst;
      if (pointsFor > pointsAgainst) current.wins += 1;
      else if (pointsFor < pointsAgainst) current.losses += 1;
      else current.ties += 1;
      rows.set(identityValue.key, current);
    };
    add(home, homeScore, awayScore, `contest:${contest.contest_id}:home`);
    add(away, awayScore, homeScore, `contest:${contest.contest_id}:away`);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, win_pct: row.games ? (row.wins + row.ties * 0.5) / row.games : null }))
    .sort((left, right) => (right.win_pct ?? -1) - (left.win_pct ?? -1)
      || right.point_diff - left.point_diff
      || right.wins - left.wins
      || left.name.localeCompare(right.name)
      || left.team_key.localeCompare(right.team_key));
}
