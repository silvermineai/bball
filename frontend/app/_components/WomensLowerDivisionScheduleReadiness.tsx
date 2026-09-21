"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduleTeam = { home?: boolean; name?: string; slug?: string; score?: number | null; winner?: boolean | null };
type ScheduleContest = {
  division: number;
  contest_id: number;
  contest_date?: string | null;
  start_time?: string | null;
  state?: string | null;
  status?: string | null;
  teams: ScheduleTeam[];
};
type ScheduleAsset = {
  generated_at?: string;
  source?: { season_year?: number; identity_limit?: string };
  calendar?: Array<{ division: number; contest_date: string; count: number }>;
  contests?: ScheduleContest[];
  receipts?: Array<{ sha256?: string; url?: string }>;
};

const parseDate = (value?: string | null): number | null => {
  if (!value) return null;
  const mmddyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const parsed = mmddyyyy ? Date.parse(`${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}T23:59:59Z`) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const displayDate = (value?: string | null) => {
  if (!value) return "Date pending";
  const parsed = parseDate(value);
  return parsed == null ? value : new Date(parsed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export function scopedWomensSchedule(asset: ScheduleAsset, division: "2" | "3"): ScheduleContest[] {
  return (asset.contests || [])
    .filter((contest) => contest.division === Number(division) && Number.isInteger(contest.contest_id) && Array.isArray(contest.teams) && contest.teams.length === 2)
    .sort((left, right) => (parseDate(left.contest_date) ?? Number.POSITIVE_INFINITY) - (parseDate(right.contest_date) ?? Number.POSITIVE_INFINITY) || left.contest_id - right.contest_id);
}

export function upcomingWomensSchedule(asset: ScheduleAsset, division: "2" | "3", now = Date.now()): ScheduleContest[] {
  return scopedWomensSchedule(asset, division).filter((contest) => {
    const date = parseDate(contest.contest_date);
    return date != null && date >= now;
  });
}

const teamNames = (contest: ScheduleContest) => {
  const home = contest.teams.find((team) => team.home === true) || contest.teams[0];
  const away = contest.teams.find((team) => team.home === false) || contest.teams[1];
  return { home: home?.name || home?.slug || "Home team", away: away?.name || away?.slug || "Away team" };
};

export default function WomensLowerDivisionScheduleReadiness({ division }: { division: "2" | "3" }) {
  const [asset, setAsset] = useState<ScheduleAsset | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/data/basketball/womens-lower-division-schedules.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: ScheduleAsset | null) => { if (active) { setAsset(value); setLoaded(true); } })
      .catch(() => { if (active) { setError("The schedule asset could not be read."); setLoaded(true); } });
    return () => { active = false; };
  }, []);

  const contests = useMemo(() => asset ? scopedWomensSchedule(asset, division) : [], [asset, division]);
  const upcoming = useMemo(() => asset ? upcomingWomensSchedule(asset, division) : [], [asset, division]);
  const calendarCount = asset?.calendar?.filter((day) => day.division === Number(division)).reduce((sum, day) => sum + day.count, 0) || 0;

  return <div className="paper-panel" style={{ marginTop: 18 }} aria-label={`Women’s D${division} schedule readiness`}>
    <div className="eyebrow">SCHEDULE EVIDENCE · WOMEN&apos;S D{division}</div>
    <h3>Upcoming games and prediction gate</h3>
    {!loaded ? <p className="muted">Checking for a retained D{division} schedule asset…</p> : error ? <p className="status-error">{error}</p> : !asset ? <>
      <p className="note">No target-season D{division} schedule asset is published yet. The exact-division capture pipeline is ready; games stay out of the prediction board until a receipt-backed schedule and a separately validated women&apos;s model are present.</p>
      <div className="scope-snapshot-counts"><strong>0</strong><span>schedule rows</span><strong>—</strong><span>predictions</span></div>
    </> : <>
      <p className="note">Rows are shown only when the retained schedule carries division={division}, a contest ID, and two team records. Team names and slugs are kept as source labels; missing slugs remain missing, and no name-only join creates a prediction.</p>
      <div className="scope-snapshot-counts"><strong>{contests.length.toLocaleString()}</strong><span>D{division} contests retained</span><strong>{upcoming.length.toLocaleString()}</strong><span>upcoming</span><strong>{asset.receipts?.length?.toLocaleString() || "0"}</strong><span>response receipts</span></div>
      <p className="muted">Calendar index count: {calendarCount.toLocaleString()} · Predictions: unavailable until the women&apos;s lower-division model contract passes.</p>
      {upcoming.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Status</th></tr></thead><tbody>{upcoming.slice(0, 25).map((contest) => { const teams = teamNames(contest); return <tr key={contest.contest_id}><td>{displayDate(contest.contest_date)}<small>{contest.start_time || "Time pending"}</small></td><th scope="row">{teams.away}</th><td>{teams.home}</td><td>{contest.status || contest.state || "scheduled"}</td></tr>; })}</tbody></table></div> : <p className="empty">No upcoming D{division} contests are present in this retained schedule asset.</p>}
      {upcoming.length > 25 ? <p className="muted">Showing 25 of {upcoming.length.toLocaleString()} upcoming contests. The retained asset remains the complete export.</p> : null}
    </>}
  </div>;
}
