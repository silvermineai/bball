"use client";

import { useEffect, useMemo, useState } from "react";
import type { SportDivision } from "../_lib/sport-scope";
import {
  divisionPlayerDetailGroups,
  retainedPlayerDetailCount,
  retainedPlayerValue,
  type DivisionPlayerWithEvidence,
} from "../_lib/division-player-detail";

type Player = DivisionPlayerWithEvidence;

type Publication = { season: number; generated_at: string; players: Player[] };
const metrics = [["ppg", "PPG"], ["rpg", "RPG"], ["apg", "APG"], ["spg", "SPG"], ["bpg", "BPG"], ["mpg", "MPG"], ["fg_pct", "FG%"], ["three_pct", "3P%"], ["ft_pct", "FT%"], ["threes_pg", "3PG"], ["ast_to", "A/TO"], ["dbl_dbl", "DD"]] as const;
type Metric = (typeof metrics)[number][0];

const value = (raw: number | null | undefined, digits = 1) => typeof raw === "number" && Number.isFinite(raw) ? raw.toFixed(digits) : "—";
const captured = (raw: string) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "capture date unavailable" : date.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function DivisionPlayerArchive({ division }: { division: SportDivision }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<Metric>("ppg");
  useEffect(() => {
    fetch("/data/basketball/ncaa-individual.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => setPublication(value))
      .catch(() => setPublication(null));
  }, []);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (publication?.players || [])
      .filter((player) => String(player.division) === division)
      .filter((player) => !needle || `${player.name} ${player.team_name || ""} ${player.player_id}`.toLowerCase().includes(needle))
      .sort((left, right) => (Number(right[metric]) || -Infinity) - (Number(left[metric]) || -Infinity) || left.name.localeCompare(right.name))
      .slice(0, 100);
  }, [division, metric, publication, query]);
  const total = publication?.players.filter((player) => String(player.division) === division).length || 0;
  return <section className="field-card division-player-archive" aria-labelledby="division-player-title">
    <div className="eyebrow">MEN&apos;S BASKETBALL · D{division} PLAYER ARCHIVE</div>
    <h2 id="division-player-title">Division player production</h2>
    <p className="muted">Browse the retained player table for Division {division}. Missing statistics stay unavailable, and rankings are sorted by one recorded field at a time.</p>
    {!publication ? <p className="muted">Loading division player archive…</p> : <>
      <div className="division-player-controls">
        <label htmlFor="division-player-search">Search player or team</label>
        <input id="division-player-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, program, or player ID" />
        <label htmlFor="division-player-metric">Sort by</label>
        <select id="division-player-metric" value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{metrics.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div>
      <p className="note">{total.toLocaleString()} retained players · showing {rows.length} rows · season {publication.season} · captured {captured(publication.generated_at)}.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Player</th><th>Team</th><th>Pos.</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">MPG</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th className="numeric">A/TO</th><th className="numeric">DD</th><th>Recorded line</th></tr></thead><tbody>{rows.map((player) => <tr key={`${division}-${player.player_id}`}><th scope="row">{player.name}<small>Player ID {player.player_id}</small></th><td>{player.team_name || "—"}</td><td>{player.position || "—"}</td><td className="numeric">{value(player.games, 0)}</td><td className="numeric">{value(player.ppg)}</td><td className="numeric">{value(player.rpg)}</td><td className="numeric">{value(player.apg)}</td><td className="numeric">{value(player.spg)}</td><td className="numeric">{value(player.bpg)}</td><td className="numeric">{value(player.mpg)}</td><td className="numeric">{value(player.fg_pct)}</td><td className="numeric">{value(player.three_pct)}</td><td className="numeric">{value(player.ast_to)}</td><td className="numeric">{value(player.dbl_dbl, 0)}</td><td><details><summary>{retainedPlayerDetailCount(player)} recorded fields</summary><p className="note">Season values retained in the checked archive. A dash means the release did not contain a numeric value.</p>{divisionPlayerDetailGroups.map((group) => <div key={group.label}><strong>{group.label}</strong><div className="note">{group.fields.map(([key, label, kind]) => <span key={key} style={{ display: "inline-block", marginRight: 12 }}>{label}: <strong>{retainedPlayerValue(player, key) == null ? "—" : value(retainedPlayerValue(player, key), kind === "rate" ? 2 : kind === "minutes" ? 1 : 0)}</strong></span>)}</div></div>)}{player.source_stats && Object.keys(player.source_stats).length ? <p className="note">Retained source row evidence: {Object.entries(player.source_stats).map(([key, evidence]) => `${key}${evidence.rank == null ? "" : ` (#${evidence.rank})`}${evidence.value == null ? "" : ` = ${evidence.value}`}`).join(" · ")}</p> : null}</details></td></tr>)}</tbody></table></div>
      {!rows.length ? <p className="empty">No retained players match this search.</p> : null}
      <p className="muted">This is an observed player production archive. It does not infer eligibility, role, or future performance.</p>
    </>}
  </section>;
}
