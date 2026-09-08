"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { fmt } from "../../_lib/format";
import {
  rosterLabCsv,
  positionContinuityWatch,
  sortRosterLabRows,
  type RosterPositionGroup,
  type RosterLabRow,
  type RosterLabSort,
} from "../../_lib/roster-readiness";

const percent = (value: number | null) =>
  value == null ? "—" : `${fmt(value * 100, 1)}%`;

function Bar({ value }: { value: number | null }) {
  return value == null ? (
    <span className="signal-bar empty" aria-hidden="true" />
  ) : (
    <span className="signal-bar" aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </span>
  );
}

export default function RosterLab({ rows }: { rows: RosterLabRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<RosterLabSort>("represented");
  const [ratedOnly, setRatedOnly] = useState(false);
  const filtered = useMemo(
    () =>
      sortRosterLabRows(
        rows.filter(
          (row) =>
            row.team.toLowerCase().includes(query.toLowerCase()) &&
            (!ratedOnly || row.ratingRank != null),
        ),
        sort,
      ),
    [query, ratedOnly, rows, sort],
  );
  const withPrior = rows.filter((row) => row.priorMinutes > 0);
  const topIncoming = [...withPrior]
    .sort((a, b) => b.incomingPriorMinutes - a.incomingPriorMinutes)
    .slice(0, 3);
  const lowestReturning = [...withPrior]
    .sort((a, b) => (a.returningShare ?? 2) - (b.returningShare ?? 2))
    .slice(0, 3);
  const positionGroups: Array<{ key: RosterPositionGroup; label: string }> = [
    { key: "guard", label: "Guard" },
    { key: "forward", label: "Forward" },
    { key: "center", label: "Center" },
  ];
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>PROGRAM</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search programs" />
        </label>
        <label className="control">
          <span>ORDER</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as RosterLabSort)}>
            <option value="represented">Prior workload represented</option>
            <option value="returning">Returning minutes share</option>
            <option value="incoming">Incoming prior minutes</option>
            <option value="listed">Listed players</option>
            <option value="rating">Adjusted net rating</option>
          </select>
        </label>
        <label className="check-control">
          <input type="checkbox" checked={ratedOnly} onChange={(event) => setRatedOnly(event.target.checked)} />
          <span>Rated programs only</span>
        </label>
      </div>
      <p className="note">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} source-listed programs shown. Every workload signal uses recorded 2025–26 minutes for exact publisher IDs; a missing value means no qualifying prior production was observed.
      </p>
      <div className="section-heading" style={{ marginTop: 22 }}>
        <p>Export the filtered roster view with ratings and schedule coverage.</p>
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            downloadCsv(
              "basketball-roster-lab-2026-27.csv",
              toCsv(
                ["Program", "Program ID", "Listed players", "Returning players", "Incoming prior-program players", "New-to-dataset players", "Ambiguous players", "Prior minutes", "Returning minutes", "Incoming prior minutes", "Represented prior minutes", "Returning minutes share", "Represented prior minutes share", "Incoming workload share", "Guards", "Forwards", "Centers", "Unreported positions", "Guard prior minutes", "Guard returning minutes", "Guard incoming prior minutes", "Guard returning share", "Forward prior minutes", "Forward returning minutes", "Forward incoming prior minutes", "Forward returning share", "Center prior minutes", "Center returning minutes", "Center incoming prior minutes", "Center returning share", "Rating rank", "Adjusted net", "Upcoming games", "Forecasted games"],
                rosterLabCsv(filtered),
              ),
            )
          }
        >
          Download CSV ↓
        </button>
      </div>
      <div className="table-scroll">
        <table className="data-table roster-lab-table">
          <thead>
            <tr><th>Program</th><th className="numeric">Schedule</th><th className="numeric">Listed</th><th className="numeric">Returning</th><th className="numeric">Incoming</th><th>Roster shape</th><th>Returning minutes</th><th>Represented workload</th><th className="numeric">Rating</th></tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.teamId}>
                <td><Link href={`/basketball/programs/${row.teamId}/`}>{row.team}</Link><small>{row.newToDataset} new to dataset · {row.ambiguous} ambiguous</small></td>
                <td className="numeric">{row.upcomingGames ? `${row.forecastedGames}/${row.upcomingGames}` : "—"}<small>forecasted / listed</small></td>
                <td className="numeric">{row.listed}</td>
                <td className="numeric">{row.returning}</td>
                <td className="numeric">{row.incoming}</td>
                <td className="numeric"><strong>{row.positionCounts.guard}/{row.positionCounts.forward}/{row.positionCounts.center}</strong><small>G / F / C · {row.positionCounts.unreported} unreported</small></td>
                <td><div className="signal-value"><Bar value={row.returningShare} /><strong>{percent(row.returningShare)}</strong></div><small>{Math.round(row.returningMinutes).toLocaleString()} of {Math.round(row.priorMinutes).toLocaleString()} prior min</small></td>
                <td><div className="signal-value"><Bar value={row.representedShare} /><strong>{percent(row.representedShare)}</strong></div><small>{Math.round(row.incomingPriorMinutes).toLocaleString()} incoming prior min</small></td>
                <td className="numeric">{row.ratingRank == null ? "—" : `#${row.ratingRank}`}<small>{row.adjustedNet == null ? "" : `${fmt(row.adjustedNet, 1)} net`}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p className="empty">No programs match this view.</p>}
      <section className="paper-panel" style={{ marginTop: 28 }}>
        <div className="eyebrow">Position continuity watch</div>
        <h2>Where recruiting can answer a role question.</h2>
        <p className="note">
          These are the five lowest returning-minute shares for each source-reported position group among programs with prior minutes. They flag where the observed workload is least represented by same-program listings; incoming minutes and incomplete rosters remain separate evidence.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Role</th><th>Program</th><th className="numeric">Prior minutes</th><th className="numeric">Returning minutes</th><th className="numeric">Incoming prior minutes</th><th className="numeric">Returning share</th></tr></thead>
            <tbody>
              {positionGroups.flatMap(({ key, label }) =>
                positionContinuityWatch(rows, key).map(({ row, workload }) => (
                  <tr key={`${key}-${row.teamId}`}>
                    <td>{label}<small>{row.positionCounts[key]} listed</small></td>
                    <td><Link href={`/basketball/programs/${row.teamId}/`}>{row.team}</Link></td>
                    <td className="numeric">{Math.round(workload.priorMinutes).toLocaleString()}</td>
                    <td className="numeric">{Math.round(workload.returningMinutes).toLocaleString()}</td>
                    <td className="numeric">{workload.incomingPriorMinutes ? Math.round(workload.incomingPriorMinutes).toLocaleString() : "—"}</td>
                    <td className="numeric"><strong>{percent(workload.returningShare)}</strong></td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section two-col">
        <article className="paper-panel"><div className="eyebrow">Incoming workload watch</div><h2>Where prior minutes arrived.</h2>{topIncoming.map((row) => <p key={row.teamId}><Link href={`/basketball/programs/${row.teamId}/`}>{row.team}</Link><br /><strong>{Math.round(row.incomingPriorMinutes).toLocaleString()} prior minutes</strong> from source-listed different-program players · {percent(row.incomingShare)} of observed prior workload.</p>)}<p className="note">A different-program observation describes two source records. It does not establish a portal transaction, eligibility or a future role.</p></article>
        <article className="paper-panel"><div className="eyebrow">Continuity watch</div><h2>Where returning workload is thin.</h2>{lowestReturning.map((row) => <p key={row.teamId}><Link href={`/basketball/programs/${row.teamId}/`}>{row.team}</Link><br /><strong>{percent(row.returningShare)}</strong> of observed prior minutes represented by same-program listings · {row.listed} listed players.</p>)}<p className="note">A partial roster can omit returning players. This is a workload observation, not a departure count or depth chart.</p></article>
      </section>
    </>
  );
}
