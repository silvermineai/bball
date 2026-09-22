"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { lowerDivisionPlayerHref } from "../_lib/division-archive-links";
import { downloadCsv, toCsv } from "../_lib/csv";
import {
  divisionPlayerArchiveExport,
  divisionPlayerArchiveMetricOptions,
  filterDivisionPlayerArchive,
  paginateDivisionPlayerArchive,
  rankDivisionPlayerArchiveRows,
} from "../_lib/division-player-archive";
import {
  divisionPlayerDetailGroups,
  retainedPlayerDetailCount,
  retainedPlayerSourceRank,
  retainedPlayerValue,
  type DivisionPlayerWithEvidence,
} from "../_lib/division-player-detail";

type Player = DivisionPlayerWithEvidence;

type Publication = { season: number; generated_at: string; players: Player[] };
const metrics = divisionPlayerArchiveMetricOptions;
type Metric = (typeof metrics)[number]["key"];

const value = (raw: number | null | undefined, digits = 1) => typeof raw === "number" && Number.isFinite(raw) ? raw.toFixed(digits) : "—";
const captured = (raw: string) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "capture date unavailable" : date.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function DivisionPlayerArchive({ division }: { division: "2" | "3" }) {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("player") || "";
  const [publication, setPublication] = useState<Publication | null>(null);
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<Metric>("ppg");
  const [page, setPage] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  useEffect(() => {
    fetch("/data/basketball/ncaa-individual.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => setPublication(value))
      .catch(() => setPublication(null));
  }, []);
  const filteredPlayers = useMemo(
    () => filterDivisionPlayerArchive(publication?.players || [], division, query, metric),
    [division, metric, publication, query],
  );
  const rankedPlayers = useMemo(
    () => rankDivisionPlayerArchiveRows(filteredPlayers, metric),
    [filteredPlayers, metric],
  );
  const pageResult = useMemo(
    () => paginateDivisionPlayerArchive(rankedPlayers, page),
    [rankedPlayers, page],
  );
  const rows = pageResult.rows;
  const total = pageResult.total;
  useEffect(() => { setPage(0); setExportMessage(""); }, [division, metric, query]);
  const downloadAll = () => {
    if (!filteredPlayers.length) return;
    const exportData = divisionPlayerArchiveExport(filteredPlayers);
    downloadCsv(`ncaa-division-${division}-player-archive-${publication?.season || "edition"}.csv`, toCsv(exportData.headers, exportData.rows));
    setExportMessage(`Downloaded ${filteredPlayers.length.toLocaleString()} matching retained player rows.`);
  };
  const selected = useMemo(
    () => publication?.players.find((player) => String(player.division) === division && String(player.player_id) === selectedId) || null,
    [division, publication, selectedId],
  );
  const closeDossierHref = `/basketball/ncaa/?division=${division}`;
  return <section className="field-card division-player-archive" aria-labelledby="division-player-title">
    <div className="eyebrow">MEN&apos;S BASKETBALL · D{division} PLAYER ARCHIVE</div>
    <h2 id="division-player-title">Division player production</h2>
    <p className="muted">Browse the retained player table for Division {division}. Missing statistics stay unavailable, and rankings are sorted by one recorded field at a time.</p>
    {!publication ? <p className="muted">Loading division player archive…</p> : <>
      {selected ? <article className="paper-panel division-archive-dossier" aria-labelledby="division-player-dossier-title" style={{ marginBottom: 20 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}><div><div className="eyebrow">Exact archive player ID · D{division}</div><h3 id="division-player-dossier-title">{selected.name}</h3></div><Link className="hero-link" href={closeDossierHref}>Close dossier →</Link></div>
        <p className="note">Archive ID {selected.player_id} · {selected.team_name || "Team unavailable"}{selected.team_ncaa_id == null ? "" : ` · team ID ${selected.team_ncaa_id}`}. This dossier is filtered from the validated D{division} edition; it never falls through to Division I.</p>
        <div className="strip"><div><strong>{value(selected.games, 0)}</strong><span>Games</span></div><div><strong>{value(selected.ppg)}</strong><span>PPG</span></div><div><strong>{value(selected.rpg)}</strong><span>RPG</span></div><div><strong>{value(selected.apg)}</strong><span>APG</span></div><div><strong>{selected.fg_pct == null ? "—" : `${value(selected.fg_pct)}%`}</strong><span>FG%</span></div><div><strong>{selected.three_pct == null ? "—" : `${value(selected.three_pct)}%`}</strong><span>3P%</span></div></div>
        <p className="note">The compact line above uses only recorded fields. A dash means this release did not contain a numeric value; no missing value is inferred.</p>
      </article> : selectedId ? <p className="status-error" role="alert">No D{division} player with archive ID {selectedId} is present in this validated edition. No other division was searched.</p> : null}
      <div className="division-player-controls">
        <label htmlFor="division-player-search">Search player or team</label>
        <input id="division-player-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, program, or player ID" />
        <label htmlFor="division-player-metric">Sort by</label>
        <select id="division-player-metric" value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{metrics.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select>
      </div>
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{total.toLocaleString()} matching retained players · page {pageResult.page + 1} of {pageResult.pages} · season {publication.season} · captured {captured(publication.generated_at)}.</p><div className="button-row"><button className="button secondary" type="button" onClick={downloadAll} disabled={!filteredPlayers.length}>Download all matching CSV ↓</button></div></div>
      {exportMessage && <p className="note" role="status">{exportMessage}</p>}
      <p className="note">Silvermine rank is calculated within the filtered Division {division} rows for the selected retained field ({metrics.find(({ key }) => key === metric)?.label || metric}); equal values share a rank. Publisher rank is shown only when the retained source published that exact field. Missing values remain unranked.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Silvermine rank</th><th>Publisher rank</th><th>Player</th><th>Team</th><th>Pos.</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">MPG</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th className="numeric">A/TO</th><th className="numeric">DD</th><th>Recorded line</th></tr></thead><tbody>{rows.map((player) => <tr key={`${division}-${player.player_id}`}><td className="rank-number">{player.archive_rank == null ? "—" : `#${player.archive_rank}`}</td><td className="rank-number">{retainedPlayerSourceRank(player, metric) == null ? "—" : `#${retainedPlayerSourceRank(player, metric)}`}<small>{retainedPlayerSourceRank(player, metric) == null ? `No exact ${metric} source rank` : `Publisher ${metric} rank`}</small></td><th scope="row"><Link href={lowerDivisionPlayerHref(division, player.player_id)}>{player.name} →</Link><small>Player ID {player.player_id}</small></th><td>{player.team_name || "—"}</td><td>{player.position || "—"}</td><td className="numeric">{value(player.games, 0)}</td><td className="numeric">{value(player.ppg)}</td><td className="numeric">{value(player.rpg)}</td><td className="numeric">{value(player.apg)}</td><td className="numeric">{value(player.spg)}</td><td className="numeric">{value(player.bpg)}</td><td className="numeric">{value(player.mpg)}</td><td className="numeric">{value(player.fg_pct)}</td><td className="numeric">{value(player.three_pct)}</td><td className="numeric">{value(player.ast_to)}</td><td className="numeric">{value(player.dbl_dbl, 0)}</td><td><details><summary>{retainedPlayerDetailCount(player)} recorded fields</summary><p className="note">Season values retained in the checked archive. A dash means this release did not contain a numeric value.</p>{divisionPlayerDetailGroups.map((group) => <div key={group.label}><strong>{group.label}</strong><div className="note">{group.fields.map(([key, label, kind]) => <span key={key} style={{ display: "inline-block", marginRight: 12 }}>{label}: <strong>{retainedPlayerValue(player, key) == null ? "—" : value(retainedPlayerValue(player, key), kind === "rate" ? 2 : kind === "minutes" ? 1 : 0)}</strong></span>)}</div></div>)}{player.source_stats && Object.keys(player.source_stats).length ? <p className="note">Retained source row evidence: {Object.entries(player.source_stats).map(([key, evidence]) => `${key}${evidence.rank == null ? "" : ` (#${evidence.rank})`}${evidence.value == null ? "" : ` = ${evidence.value}`}`).join(" · ")}</p> : null}</details></td></tr>)}</tbody></table></div>
      {!rows.length ? <p className="empty">No retained players match this search.</p> : null}
      <div className="pagination"><span>{total.toLocaleString()} matching rows · all retained fields available in the CSV</span><div><button className="button secondary" type="button" disabled={!pageResult.page} onClick={() => setPage(pageResult.page - 1)}>← Previous</button><button className="button secondary" type="button" disabled={pageResult.page + 1 >= pageResult.pages} onClick={() => setPage(pageResult.page + 1)}>Next →</button></div></div>
      <p className="muted">This is an observed player production archive. It does not infer eligibility, role, or future performance.</p>
    </>}
  </section>;
}
