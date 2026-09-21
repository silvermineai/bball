export type MensLowerDivision = "2" | "3";

export type MensLowerScheduleTeam = {
  home?: boolean;
  name?: string;
  slug?: string | null;
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

