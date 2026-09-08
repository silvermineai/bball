"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { fmt } from "../../_lib/format";
import {
  rosterLabCsv,
  positionContinuityWatch,
  parseRosterLabFilters,
  rosterLabFilterSearch,
  sortRosterLabRows,
  classExperienceWatch,
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
  const [copied, setCopied] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const filters = parseRosterLabFilters(window.location.search);
    setQuery(filters.query);
    setSort(filters.sort);
    setRatedOnly(filters.ratedOnly);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.search = rosterLabFilterSearch({ query, sort, ratedOnly });
    window.history.replaceState(window.history.state, "", url);
  }, [hydrated, query, ratedOnly, sort]);
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
  const youngestWorkload = classExperienceWatch(rows, 5);
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
      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied("Roster lab link copied.");
            } catch {
              setCopied("Copy the filtered URL from your address bar.");
            }
          }}
        >
          Copy roster lab link
        </button>
        {copied && <span className="note" role="status">{copied}</span>}
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
              ["Program", "Program ID", "Listed players", "Returning players", "Incoming prior-program players", "New-to-dataset players", "Ambiguous players", "Prior minutes", "Returning minutes", "Incoming prior minutes", "Represented prior minutes", "Returning minutes share", "Represented prior minutes share", "Incoming workload share", "Guards", "Forwards", "Centers", "Unreported positions", "Guard prior minutes", "Guard returning minutes", "Guard incoming prior minutes", "Guard returning share", "Forward prior minutes", "Forward returning minutes", "Forward incoming prior minutes", "Forward returning share", "Center prior minutes", "Center returning minutes", "Center incoming prior minutes", "Center returning share", "Freshmen", "Sophomores", "Juniors", "Seniors", "Unreported class", "Freshman prior minutes", "Freshman returning minutes", "Freshman incoming prior minutes", "Freshman returning share", "Sophomore prior minutes", "Sophomore returning minutes", "Sophomore incoming prior minutes", "Sophomore returning share", "Junior prior minutes", "Junior returning minutes", "Junior incoming prior minutes", "Junior returning share", "Senior prior minutes", "Senior returning minutes", "Senior incoming prior minutes", "Senior returning share", "Upperclass prior minutes share", "Rating rank", "Adjusted net", "Upcoming games", "Forecasted games"],
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
            <tr><th>Program</th><th className="numeric">Schedule</th><th className="numeric">Listed</th><th className="numeric">Returning</th><th className="numeric">Incoming</th><th>Roster shape</th><th>Class mix</th><th>Returning minutes</th><th>Represented workload</th><th className="numeric">Rating</th></tr>
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
                <td className="numeric"><strong>{row.classCounts.freshman}/{row.classCounts.sophomore}/{row.classCounts.junior}/{row.classCounts.senior}</strong><small>Fr / So / Jr / Sr · {percent(row.upperclassPriorMinutesShare)} prior upperclass</small></td>
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
      <section className="paper-panel" style={{ marginTop: 28 }}>
        <div className="eyebrow">Class-year workload watch</div>
        <h2>Where the observed core is youngest.</h2>
        <p className="note">
          Upperclass workload is prior recorded minutes attached to source-listed juniors or seniors, divided by all prior minutes observed for that program. It is a recruiting and development question, not an age, eligibility or availability judgment.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Program</th><th className="numeric">Fresh / Soph / Jr / Sr</th><th className="numeric">Upperclass prior minutes</th><th className="numeric">Upperclass share</th><th className="numeric">Represented workload</th></tr></thead>
            <tbody>
              {youngestWorkload.map((row) => (
                <tr key={row.teamId}>
                  <td><Link href={`/basketball/programs/${row.teamId}/`}>{row.team}</Link><small>{row.listed} listed · {Math.round(row.priorMinutes).toLocaleString()} prior minutes</small></td>
                  <td className="numeric">{row.classCounts.freshman} / {row.classCounts.sophomore} / {row.classCounts.junior} / {row.classCounts.senior}</td>
                  <td className="numeric">{Math.round(row.classWorkload.junior.priorMinutes + row.classWorkload.senior.priorMinutes).toLocaleString()}</td>
                  <td className="numeric"><strong>{percent(row.upperclassPriorMinutesShare)}</strong></td>
                  <td className="numeric">{percent(row.representedShare)}</td>
                </tr>
              ))}
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
