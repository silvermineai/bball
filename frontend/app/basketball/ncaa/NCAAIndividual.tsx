"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { fmt } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import {
  ncaaStatLabels,
  ncaaFilterSearch,
  parseNCAAFilters,
  publisherRank,
  sortNCAAPlayers,
  type NCAAIndividualPlayer,
  type NCAAIndividualRelease,
  type NCAAStatKey,
  type NCAADivisionFilter,
  ncaaValueCoverage,
} from "../../_lib/ncaa-individual";

const stats = Object.keys(ncaaStatLabels) as NCAAStatKey[];
const percentStats = new Set<NCAAStatKey>(["fg_pct", "three_pct", "ft_pct"]);

export default function NCAAIndividual() {
  const params = useSearchParams();
  const initial = parseNCAAFilters(params.toString());
  const { data, error } = useBasketballRelease<NCAAIndividualRelease>("ncaa-individual");
  const [division, setDivision] = useState<NCAADivisionFilter>(initial.division);
  const [stat, setStat] = useState<NCAAStatKey>(initial.stat);
  const [query, setQuery] = useState(initial.query);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    const next = ncaaFilterSearch({ division, stat, query });
    if (next !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
    setPage(0);
    setCopied("");
  }, [division, stat, query]);
  const rows = sortNCAAPlayers(
    (data?.players || []).filter((p) =>
      (division === "all" || p.division === +division) &&
      `${p.name} ${p.team_name || ""} ${p.conference || ""}`.toLowerCase().includes(query.toLowerCase()),
    ),
    stat,
  );
  const pageRows = rows.slice(page * 40, page * 40 + 40);
  const shown = (p: NCAAIndividualPlayer) => {
    const value = p[stat];
    return value == null ? "—" : fmt(value, percentStats.has(stat) ? 1 : stat === "ast_to" ? 2 : 1);
  };
  const download = () => downloadCsv(`ncaa-leaders-${division}-${stat}.csv`, toCsv(
    ["View order", "Publisher rank", "Player", "NCAA ID", "Program", "Division", "Conference", "Class", "Position", "Games", ncaaStatLabels[stat]],
    rows.map((p, i) => [i + 1, publisherRank(p, stat), p.name, p.player_id, p.team_name, p.division, p.conference, p.class_year, p.position, p.games, p[stat]]),
  ));
  const divisionCount = division === "all"
    ? Object.values(data?.coverage.divisions || {}).reduce((sum, d) => sum + d.players, 0)
    : data?.coverage.divisions[division]?.players || 0;
  const coverage = data ? ncaaValueCoverage(data.players) : [];
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Leaderboard link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  return (
    <>
      <div className="toolbar">
        <label className="control"><span>DIVISION</span><select value={division} onChange={(e) => setDivision(e.target.value as NCAADivisionFilter)}><option value="1">Division I</option><option value="2">Division II</option><option value="3">Division III</option><option value="all">All divisions</option></select></label>
        <label className="control"><span>LEADERBOARD</span><select value={stat} onChange={(e) => setStat(e.target.value as NCAAStatKey)}>{stats.map((key) => <option key={key} value={key}>{ncaaStatLabels[key]}</option>)}</select></label>
        <label className="control"><span>PLAYER OR PROGRAM</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search national records" /></label>
        <button className="button secondary" type="button" onClick={share}>Copy leaderboard link</button>
      </div>
      {copied && <p role="status">{copied}</p>}
      {error ? <p role="alert" className="status-error">{error}</p> : !data ? <p role="status" className="empty">Loading NCAA national records…</p> : <>
        <div className="strip" style={{ borderTop: "1px solid var(--ink)", marginBottom: 25 }}>
          <div><strong>{data.coverage.players.toLocaleString()}</strong><span>Published player records</span></div>
          <div><strong>{divisionCount.toLocaleString()}</strong><span>{division === "all" ? "All division records" : `Division ${division} records`}</span></div>
          <div><strong>{data.season - 1}–{String(data.season).slice(-2)}</strong><span>Final statistics season</span></div>
          <div><strong>{data.generated_at ? new Date(data.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}</strong><span>Source snapshot</span></div>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>These are qualifying rows from NCAA Statistics final national-ranking pages. Counts vary by statistic and division; a missing value means that snapshot did not publish a matching row. They are source leaderboards, not a complete census or a recruiting ranking.</p>
        <details className="career-coverage-details" style={{ marginBottom: 24 }}>
          <summary>Published values by division and measure</summary>
          <p className="note">The matrix counts non-null values in this release. A blank source field is left blank; it is never converted to zero.</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Measure</th><th className="numeric">Division I</th><th className="numeric">Division II</th><th className="numeric">Division III</th></tr></thead>
              <tbody>{coverage.map((row) => <tr key={row.stat}><td>{ncaaStatLabels[row.stat]}</td><td className="numeric">{row.divisions[1].toLocaleString()}</td><td className="numeric">{row.divisions[2].toLocaleString()}</td><td className="numeric">{row.divisions[3].toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
        <div className="section-heading" style={{ marginBottom: 20 }}><p>{rows.length.toLocaleString()} matching records · {rows.filter((p) => p[stat] != null).length.toLocaleString()} published values · {ncaaStatLabels[stat]}</p><button className="button secondary" type="button" onClick={download}>Download CSV ↓</button></div>
        <p className="note" style={{ marginBottom: 20 }}>View order follows the current division, search and measure filters. Publisher rank is shown only when that NCAA page supplied a rank for the selected measure.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>View order</th><th>Publisher rank</th><th>Player</th><th>Program</th><th>Division</th><th>Class / position</th><th className="numeric">{ncaaStatLabels[stat]}</th><th className="numeric">Games</th></tr></thead><tbody>{pageRows.map((p, i) => <tr key={`${p.division}-${p.player_id}`}><td className="rank-number">{page * 40 + i + 1}</td><td className="rank-number">{publisherRank(p, stat) ?? "—"}</td><td><a href={`https://stats.ncaa.org/players/${p.player_id}`} target="_blank" rel="noreferrer">{p.name} ↗</a><small>NCAA {p.player_id}</small><a className="hero-link" href={`/basketball/players/?season=${data.season}&q=${encodeURIComponent(p.name)}`}>Search archive by name →</a></td><td>{p.team_ncaa_id ? <a href={`https://stats.ncaa.org/teams/${p.team_ncaa_id}`} target="_blank" rel="noreferrer">{p.team_name || "NCAA team"} ↗</a> : (p.team_name || "—")}<small>{p.conference || ""}</small></td><td>D{p.division}</td><td>{[p.class_year, p.position, p.height].filter(Boolean).join(" · ") || "—"}</td><td className="numeric">{shown(p)}</td><td className="numeric">{p.games ?? "—"}</td></tr>)}</tbody></table></div>
        {!rows.length && <p className="empty">No records match that search.</p>}
        <div className="pagination"><span>{rows.length.toLocaleString()} records · page {page + 1} of {Math.max(1, Math.ceil(rows.length / 40))}</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * 40 >= rows.length} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      </>}
    </>
  );
}
