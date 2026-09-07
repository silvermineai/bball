"use client";

import { useEffect, useState } from "react";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { fmt } from "../../_lib/format";
import {
  ncaaStatLabels,
  sortNCAAPlayers,
  type NCAAIndividualPlayer,
  type NCAAIndividualRelease,
  type NCAAStatKey,
} from "../../_lib/ncaa-individual";

const stats = Object.keys(ncaaStatLabels) as NCAAStatKey[];
const percentStats = new Set<NCAAStatKey>(["fg_pct", "three_pct", "ft_pct"]);

export default function NCAAIndividual() {
  const { data, error } = useBasketballRelease<NCAAIndividualRelease>("ncaa-individual");
  const [division, setDivision] = useState("1");
  const [stat, setStat] = useState<NCAAStatKey>("ppg");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [division, stat, query]);
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
  return (
    <>
      <div className="toolbar">
        <label className="control"><span>DIVISION</span><select value={division} onChange={(e) => setDivision(e.target.value)}><option value="1">Division I</option><option value="2">Division II</option><option value="3">Division III</option><option value="all">All divisions</option></select></label>
        <label className="control"><span>LEADERBOARD</span><select value={stat} onChange={(e) => setStat(e.target.value as NCAAStatKey)}>{stats.map((key) => <option key={key} value={key}>{ncaaStatLabels[key]}</option>)}</select></label>
        <label className="control"><span>PLAYER OR PROGRAM</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search national records" /></label>
      </div>
      {error ? <p role="alert" className="status-error">{error}</p> : !data ? <p role="status" className="empty">Loading NCAA national records…</p> : <>
        <div className="strip" style={{ borderTop: "1px solid var(--ink)", marginBottom: 25 }}>
          <div><strong>{data.coverage.players.toLocaleString()}</strong><span>Published player records</span></div>
          <div><strong>{data.coverage.divisions[division === "all" ? "1" : division]?.players.toLocaleString() || "—"}</strong><span>{division === "all" ? "Division I reference" : `Division ${division} records`}</span></div>
          <div><strong>{data.season - 1}–{String(data.season).slice(-2)}</strong><span>Final statistics season</span></div>
          <div><strong>{data.generated_at ? new Date(data.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}</strong><span>Source snapshot</span></div>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>These are qualifying rows from NCAA Statistics final national-ranking pages. Counts vary by statistic and division; a missing value means that snapshot did not publish a matching row. They are source leaderboards, not a complete census or a recruiting ranking.</p>
        <div className="section-heading" style={{ marginBottom: 20 }}><p>{rows.length.toLocaleString()} matching records · {ncaaStatLabels[stat]}</p></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Program</th><th>Division</th><th>Class / position</th><th className="numeric">{ncaaStatLabels[stat]}</th><th className="numeric">Games</th></tr></thead><tbody>{pageRows.map((p, i) => <tr key={`${p.division}-${p.player_id}`}><td className="rank-number">{page * 40 + i + 1}</td><td>{p.name}<small>NCAA {p.player_id}</small></td><td>{p.team_name || "—"}<small>{p.conference || ""}</small></td><td>D{p.division}</td><td>{[p.class_year, p.position, p.height].filter(Boolean).join(" · ") || "—"}</td><td className="numeric">{shown(p)}</td><td className="numeric">{p.games ?? "—"}</td></tr>)}</tbody></table></div>
        {!rows.length && <p className="empty">No records match that search.</p>}
        <div className="pagination"><span>{rows.length.toLocaleString()} records · page {page + 1} of {Math.max(1, Math.ceil(rows.length / 40))}</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * 40 >= rows.length} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      </>}
    </>
  );
}

