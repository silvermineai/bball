"use client";

import { useEffect, useMemo, useState } from "react";
import {
  mensLowerDivisionStandings,
  scopedMensLowerSchedule,
  upcomingMensLowerSchedule,
  type MensLowerDivision,
  type MensLowerScheduleAsset,
  type MensLowerScheduleContest,
} from "../_lib/mens-lower-division-schedule";
import { summarizeLowerDivisionTargetProbe, type LowerDivisionTargetProbe, type LowerDivisionTargetProbeSummary } from "../_lib/lower-division-target-probe";

const parseDate = (value?: string | null) => {
  const mmddyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || "");
  const parsed = mmddyyyy
    ? Date.parse(`${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}T23:59:59Z`)
    : Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
};

const displayDate = (value?: string | null) => {
  if (!value) return "Date pending";
  const parsed = parseDate(value);
  return parsed == null
    ? value
    : new Date(parsed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const teamNames = (contest: MensLowerScheduleContest) => {
  const home = contest.teams.find((team) => team.home === true) || contest.teams[0];
  const away = contest.teams.find((team) => team.home === false) || contest.teams[1];
  return { home: home?.name || home?.slug || "Home team", away: away?.name || away?.slug || "Away team" };
};

export default function MensLowerDivisionScheduleArchive({ division }: { division: MensLowerDivision }) {
  const [asset, setAsset] = useState<MensLowerScheduleAsset | null>(null);
  const [targetProbe, setTargetProbe] = useState<LowerDivisionTargetProbeSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/data/basketball/mens-lower-division-schedules.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("The men’s lower-division schedule archive is unavailable."))),
      fetch("/data/basketball/mens-lower-division-target-probe.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : null).catch(() => null),
    ])
      .then(([value, probe]: [MensLowerScheduleAsset, LowerDivisionTargetProbe | null]) => { if (!controller.signal.aborted) { setAsset(value); setTargetProbe(summarizeLowerDivisionTargetProbe(probe)); setLoaded(true); } })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The men’s lower-division schedule archive is unavailable.");
          setLoaded(true);
        }
      });
    return () => controller.abort();
  }, []);

  const contests = useMemo(() => asset ? scopedMensLowerSchedule(asset, division) : [], [asset, division]);
  const calendarCount = asset?.calendar?.filter((day) => day.division === Number(division)).reduce((sum, day) => sum + day.count, 0) || 0;
  const seasonLabel = asset?.source?.season_year == null
    ? "season unavailable"
    : `${asset.source.season_year}–${String(asset.source.season_year + 1).slice(-2)}`;
  const completed = contests.filter((contest) => {
    const state = `${contest.state || ""} ${contest.status || ""}`.toLowerCase();
    return state.includes("final") || state === "f";
  }).length;
  const standings = useMemo(() => asset ? mensLowerDivisionStandings(asset, division) : [], [asset, division]);
  const upcoming = useMemo(() => asset ? upcomingMensLowerSchedule(asset, division) : [], [asset, division]);

  return <div className="paper-panel" style={{ marginTop: 18 }} aria-label={`Men’s D${division} match archive`}>
    <div className="eyebrow">MATCH ARCHIVE · MEN&apos;S D{division}</div>
    <h3>Recorded games and exact-division scope</h3>
    {!loaded ? <p className="muted">Loading the retained D{division} match archive…</p> : error ? <p className="status-error" role="alert">{error}</p> : !asset ? <p className="note">No receipt-backed men&apos;s D{division} schedule archive is published.</p> : <>
      <p className="note">This is the archived {seasonLabel} NCAA.com release. Rows were requested with sportCode=MBB and division={division}. Contest IDs, source team slugs, dates, scores, and statuses are retained. Team names are not joined to the D1 identity or prediction editions.</p>
      {targetProbe ? <div className="notice" style={{ marginBottom: 14 }}><strong>{targetProbe.season} target-season availability probe</strong><p className="muted" style={{ margin: "4px 0 0" }}>NCAA endpoint checked for months {targetProbe.months.join(", ")}: {targetProbe.contests.toLocaleString()} contests and {targetProbe.calendarDays.toLocaleString()} calendar days returned across {targetProbe.receipts.toLocaleString()} receipt-backed responses ({new Date(targetProbe.generatedAt).toLocaleString()}). Empty responses remain unavailable data; predictions stay gated until a current exact-division schedule is published.</p></div> : null}
      <div className="scope-snapshot-counts"><strong>{contests.length.toLocaleString()}</strong><span>D{division} archived contests</span><strong>{completed.toLocaleString()}</strong><span>completed</span><strong>{upcoming.length.toLocaleString()}</strong><span>upcoming in archive</span><strong>{asset.receipts?.length?.toLocaleString() || "0"}</strong><span>response receipts</span></div>
      <h4 style={{ marginTop: 22 }}>Upcoming exact-division games</h4>
      {upcoming.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Status</th></tr></thead><tbody>{upcoming.slice(0, 25).map((contest) => { const teams = teamNames(contest); return <tr key={contest.contest_id}><td>{displayDate(contest.contest_date)}<small>{contest.start_time || "Time pending"}</small></td><th scope="row">{teams.away}</th><td>{teams.home}</td><td>{contest.status || contest.state || "scheduled"}</td></tr>; })}</tbody></table></div> : <p className="empty">No upcoming D{division} games are present in the retained schedule release. The target-season probe above is the authoritative check; no future game or forecast is inferred.</p>}
      {upcoming.length > 25 ? <p className="muted">Showing 25 of {upcoming.length.toLocaleString()} upcoming archived contests.</p> : null}
      <h4 style={{ marginTop: 22 }}>Within-division team table</h4>
      <p className="muted">Derived from retained final scores only. Win percentage uses a half-win for an officially reported tie; teams with no valid finals are omitted.</p>
      {standings.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Team</th><th className="numeric">GP</th><th className="numeric">W–L</th><th className="numeric">Win%</th><th className="numeric">PF</th><th className="numeric">PA</th><th className="numeric">Diff</th></tr></thead><tbody>{standings.slice(0, 50).map((row, index) => <tr key={row.team_key}><td className="rank-number">{index + 1}</td><th scope="row">{row.name}<small>{row.slug || "publisher name key"}{row.conference ? ` · ${row.conference}` : ""}</small></th><td className="numeric">{row.games}</td><td className="numeric">{row.wins}–{row.losses}{row.ties ? `–${row.ties}` : ""}</td><td className="numeric">{row.win_pct == null ? "—" : `${(row.win_pct * 100).toFixed(1)}%`}</td><td className="numeric">{row.points_for}</td><td className="numeric">{row.points_against}</td><td className="numeric">{row.point_diff > 0 ? "+" : ""}{row.point_diff}</td></tr>)}</tbody></table></div> : <p className="empty">No valid final scores are available for this division table.</p>}
      {standings.length > 50 ? <p className="muted">Showing 50 of {standings.length.toLocaleString()} teams ranked by win percentage, then point differential.</p> : null}
      <p className="muted">Calendar index count: {calendarCount.toLocaleString()} · 2026–27 predictions: unavailable until a current-season schedule and exact-division model history pass validation.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Status</th><th>Score</th></tr></thead><tbody>{contests.slice(0, 25).map((contest) => { const teams = teamNames(contest); const home = contest.teams.find((team) => team.home === true) || contest.teams[0]; const away = contest.teams.find((team) => team.home === false) || contest.teams[1]; return <tr key={contest.contest_id}><td>{displayDate(contest.contest_date)}<small>{contest.start_time || "Time pending"}</small></td><th scope="row">{teams.away}</th><td>{teams.home}</td><td>{contest.status || contest.state || "scheduled"}</td><td>{away?.score == null || home?.score == null ? "—" : `${away.score}–${home.score}`}</td></tr>; })}</tbody></table></div>
      {contests.length > 25 ? <p className="muted">Showing 25 of {contests.length.toLocaleString()} retained contests. The source archive remains complete.</p> : null}
    </>}
  </div>;
}
