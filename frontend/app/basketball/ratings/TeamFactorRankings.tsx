"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { BBTeam } from "../../_lib/basketball-types";
import { fmt } from "../../_lib/format";
import { rankTeamFactorRows, teamFactorDefinitions, teamFactorDefinition, type TeamFactorKey } from "../../_lib/team-factor-rankings";

export default function TeamFactorRankings({ teams }: { teams: BBTeam[] }) {
  const [metric, setMetric] = useState<TeamFactorKey>("adj_off_efg");
  const [query, setQuery] = useState("");
  const definition = teamFactorDefinition(metric);
  const allRanked = useMemo(() => rankTeamFactorRows(teams, metric), [metric, teams]);
  const ranked = useMemo(() => allRanked.filter(({ team }) => team.name.toLowerCase().includes(query.toLowerCase())).slice(0, 50), [allRanked, query]);
  return <section className="paper-panel" aria-labelledby="team-factor-rankings-title" style={{ marginTop: 28 }}>
    <div className="section-heading" style={{ marginBottom: 10 }}>
      <div><div className="eyebrow">Adjusted factor ranks · 2025–26</div><h2 id="team-factor-rankings-title">Where teams win possessions</h2></div>
      <span className="note">{allRanked.length.toLocaleString()} rated programs</span>
    </div>
    <p className="note">Choose one opponent-adjusted Four Factor lens. Ranks use the retained rated field, preserve the metric&apos;s favorable direction, and never blend factors into a new score.</p>
    <div className="toolbar">
      <label className="control"><span>FACTOR</span><select value={metric} onChange={(event) => setMetric(event.target.value as TeamFactorKey)}>{teamFactorDefinitions.map((item) => <option key={item.key} value={item.key}>{item.shortLabel} · {item.label}</option>)}</select></label>
      <label className="control"><span>PROGRAM</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search programs" /></label>
    </div>
    <p className="note">{definition.higherIsBetter ? "Higher is favorable." : "Lower is favorable."} Values are adjusted rates shown as percentages; percentile is favorable within this factor&apos;s available population. A missing source value is excluded from that factor&apos;s denominator.</p>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Program</th><th className="numeric">Value</th><th className="numeric">Favorable percentile</th><th className="numeric">Silvermine net rank</th></tr></thead><tbody>{ranked.map((row) => <tr key={`${metric}-${row.team.id}`}><td className="rank-number">{row.rank}</td><th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(row.team.id)}/`}>{row.team.name}</Link><small>{row.team.wins}–{Math.max(0, row.team.games - row.team.wins)} · {row.team.games} paired games</small></th><td className="numeric"><strong>{fmt(row.value * 100)}%</strong></td><td className="numeric"><div className="percentile-track" aria-hidden="true"><span style={{ width: `${row.percentile}%` }} /></div><span>{fmt(row.percentile, 0)}%</span></td><td className="numeric">{row.team.rank}</td></tr>)}</tbody></table></div>
    {!ranked.length ? <p className="empty">No rated programs match that search.</p> : null}
    <p className="muted">Provenance: Silvermine&apos;s retained 2025–26 opponent-adjusted team rating edition. These ranks describe historical team-season performance; they do not alter the 2026–27 forecast or imply current roster strength.</p>
  </section>;
}
