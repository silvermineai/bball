"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { fmt } from "../../_lib/format";
import {
  parseRosterBoardFilters,
  rosterBoardRows,
  rosterBoardSortSearch,
  rosterBoardTotals,
  type RosterBoardSort,
  type RosterBoardStatus,
} from "../../_lib/roster-board";
import type { BBRosters } from "../../_lib/basketball-types";

const sortLabels: Record<RosterBoardSort, string> = {
  mpg: "Prior minutes per game",
  ppg: "Prior points per game",
  minutes: "Prior total minutes",
  ts: "Prior true shooting",
  efg: "Prior effective FG%",
  apg: "Prior assists per game",
  rpg: "Prior rebounds per game",
};

const statusLabels: Record<RosterBoardStatus, string> = {
  all: "All source-listed players",
  same_program: "Same-program prior record",
  different_program: "Different-program prior record",
  new_to_dataset: "No prior appearance observed",
  ambiguous: "Multiple current programs",
};

export default function RosterBoard({ data }: { data: BBRosters }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RosterBoardStatus>("all");
  const [sort, setSort] = useState<RosterBoardSort>("mpg");
  const [minimumMinutes, setMinimumMinutes] = useState(0);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = parseRosterBoardFilters(window.location.search);
    setQuery(initial.query);
    setStatus(initial.status);
    setSort(initial.sort);
    setMinimumMinutes(initial.minimumMinutes);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.search = rosterBoardSortSearch({ query, status, sort, minimumMinutes });
    window.history.replaceState(window.history.state, "", url);
    setPage(0);
  }, [hydrated, query, status, sort, minimumMinutes]);

  const rows = rosterBoardRows(data, { query, status, sort, minimumMinutes });
  const totals = rosterBoardTotals(rows);
  const pageRows = rows.slice(page * 30, page * 30 + 30);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Roster board link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  const updateQuery = (value: string) => { setQuery(value); setPage(0); };
  const csv = () =>
    downloadCsv(
      "basketball-2026-27-roster-workload-board.csv",
      toCsv(
        [
          "Rank",
          "Player",
          "Source ID",
          "Program",
          "Status",
          "Position",
          "Prior programs",
          "Prior games",
          "Prior minutes",
          "Prior MPG",
          "Prior PPG",
          "Prior RPG",
          "Prior APG",
          "Prior eFG%",
          "Prior TS%",
          "Workload label",
          "Source URL",
        ],
        rows.map((row) => [
          row.rank,
          row.name,
          row.id,
          row.team,
          statusLabels[row.status as RosterBoardStatus] || row.status,
          row.position,
          row.previous_teams.join("; "),
          row.prior_production?.games,
          row.prior_production?.minutes,
          row.prior_production?.mpg,
          row.prior_production?.ppg,
          row.prior_production?.rpg,
          row.prior_production?.apg,
          row.prior_production?.efg == null ? null : row.prior_production.efg * 100,
          row.prior_production?.ts == null ? null : row.prior_production.ts * 100,
          row.workload_label,
          row.source_url,
        ]),
      ),
    );

  return (
    <>
      <div className="strip">
        <div><strong>{totals.rows.toLocaleString()}</strong><span>Players in this view</span></div>
        <div><strong>{totals.linked.toLocaleString()}</strong><span>With prior recorded production</span></div>
        <div><strong>{Math.round(totals.priorMinutes).toLocaleString()}</strong><span>Prior minutes represented</span></div>
        <div><strong>{totals.highWorkload.toLocaleString()}</strong><span>25+ prior MPG</span></div>
      </div>
      <div className="toolbar">
        <label className="control"><span>PLAYER OR PROGRAM</span><input type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search player, program or prior school" /></label>
        <label className="control"><span>ROSTER OBSERVATION</span><select value={status} onChange={(event) => setStatus(event.target.value as RosterBoardStatus)}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="control"><span>RANK BY</span><select value={sort} onChange={(event) => setSort(event.target.value as RosterBoardSort)}>{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="control"><span>MINIMUM PRIOR MINUTES</span><select value={minimumMinutes} onChange={(event) => setMinimumMinutes(Number(event.target.value))}><option value={0}>Any listed player</option><option value={10}>10+ minutes</option><option value={20}>20+ minutes</option><option value={30}>30+ minutes</option></select></label>
      </div>
      <p className="note">Sorted by {sortLabels[sort]}. “Same program” and “different program” describe source-ID prior records; “new to dataset” means no prior appearance was found in this archive. Missing production remains missing.</p>
      <div className="section-heading" style={{ marginBottom: 20 }}><p role="status">{rows.length.toLocaleString()} matching source-listed players · page {page + 1} of {Math.max(1, Math.ceil(rows.length / 30))}</p><div className="button-row"><button className="button secondary" type="button" onClick={share}>Copy board link</button><button className="button secondary" type="button" onClick={csv}>Download CSV ↓</button></div></div>
      {copied && <p role="status">{copied}</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player / program</th><th>Roster observation</th><th>Prior workload</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">eFG%</th><th className="numeric">TS%</th><th>Evidence</th></tr></thead><tbody>{pageRows.map((row) => <tr key={`${row.id}-${row.team_id}`}><td className="rank-number">{row.rank ?? "—"}</td><th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(row.id)}&season=2026`}>{row.name}</Link><small>{row.team} · {row.position || "Position unavailable"}</small></th><td>{statusLabels[row.status as RosterBoardStatus] || row.status}<small>{row.previous_teams.join(", ") || "No prior program listed"}</small></td><td>{row.prior_production ? <><strong>{fmt(row.prior_production.mpg)} MPG</strong><small>{Math.round(row.prior_production.minutes).toLocaleString()} min · {row.prior_production.games} GP · {row.workload_label}</small></> : "No prior record"}</td><td className="numeric">{fmt(row.prior_production?.ppg)}</td><td className="numeric">{fmt(row.prior_production?.rpg)}</td><td className="numeric">{fmt(row.prior_production?.apg)}</td><td className="numeric">{row.prior_production?.efg == null ? "—" : `${fmt(row.prior_production.efg * 100)}%`}</td><td className="numeric">{row.prior_production?.ts == null ? "—" : `${fmt(row.prior_production.ts * 100)}%`}</td><td>{row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">Roster source ↗</a> : "No source link"}</td></tr>)}</tbody></table></div>
      {!pageRows.length && <p className="empty">No source-listed players match these filters.</p>}
      <div className="pagination"><span>{rows.length.toLocaleString()} records · descriptive prior production only</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * 30 >= rows.length} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      <section className="paper-panel" style={{ marginTop: 28 }}><div className="eyebrow">How to use the board</div><h2>Start with workload, then verify the story.</h2><p>Prior minutes and rates describe the imported 2025–26 record attached to the source listing. They do not forecast 2026–27 performance, establish transfer status or change the Silvermine matchup model. Open a player file, read the source roster record and then check dated school announcements before making a recruiting conclusion.</p><p><Link href="/basketball/recruiting/">Open dated recruiting evidence →</Link> <span> · </span><Link href="/basketball/roster-lab/">Compare program workload continuity →</Link></p></section>
    </>
  );
}
