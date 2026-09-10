"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { date } from "../../_lib/format";
import {
  filterAndSortStyle,
  type PossessionStyleCatalog,
  type PossessionStyleEdition,
  type PossessionStyleRow,
  type PossessionStyleSort,
} from "../../_lib/possession-style";

type LiveMeta = { seasons?: number[]; source_receipts?: Array<{ season: number; url: string; fetched_at: string; sha256: string }> };
type LiveResponse = { rows?: Array<Omit<PossessionStyleRow, "season"> & { season: number }> };

const pct = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const num = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);

export default function Style({ catalog }: { catalog: PossessionStyleCatalog }) {
  const fallbackSeasons = catalog.seasons.map((edition) => edition.season).sort((a, b) => b - a);
  const [season, setSeason] = useState(String(fallbackSeasons[0] ?? 2026));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PossessionStyleSort>("possessions");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [meta, setMeta] = useState<LiveMeta | null>(null);
  const [rows, setRows] = useState<PossessionStyleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [error, setError] = useState("");

  const fallbackEdition = useMemo(() => catalog.seasons.find((edition) => edition.season === Number(season)), [catalog.seasons, season]);
  const fallbackRows = useMemo(() => (fallbackEdition?.teams || []).map((row) => ({ ...row, season: Number(season) })), [fallbackEdition, season]);
  const source = meta?.source_receipts?.find((receipt) => receipt.season === Number(season)) || fallbackEdition?.source;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/possession-style?meta=1", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw Error("metadata unavailable"); return response.json() as Promise<LiveMeta>; })
      .then((value) => { if (controller.signal.aborted) return; setMeta(value); setStatus("live"); const available = (value.seasons || []).sort((a, b) => b - a); if (available.length && !available.includes(Number(season))) setSeason(String(available[0])); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setStatus("fallback"); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const params = new URLSearchParams({ season, page: String(page), sort, direction });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/basketball/research/possession-style?${params}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw Error("live possession style unavailable"); return response.json() as Promise<LiveResponse & { total?: number }>; })
      .then((value) => { if (controller.signal.aborted) return; setRows((value.rows || []).map((row) => ({ ...row, season: Number(row.season) }))); setTotal(value.total || 0); setStatus("live"); })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name === "AbortError") return;
        const filtered = filterAndSortStyle(fallbackRows, query, sort, direction);
        setRows(filtered.slice(page * 40, page * 40 + 40)); setTotal(filtered.length); setStatus("fallback"); setError("");
      });
    return () => controller.abort();
  }, [direction, fallbackRows, page, query, season, sort]);

  const seasons = meta?.seasons?.length ? meta.seasons : fallbackSeasons;
  const edition = fallbackEdition;
  const pages = Math.max(1, Math.ceil(total / 40));
  const exportRows = rows.map((row) => [row.season, row.team_name, row.team_id, row.games, row.possessions, row.points, row.points_per_possession, row.possessions_per_game, row.transition_share == null ? null : row.transition_share * 100, row.assisted_share == null ? null : row.assisted_share * 100, row.garbage_time_share == null ? null : row.garbage_time_share * 100]);

  return <>
    <div className="page-title">
      <div className="eyebrow">NCAA source archive / possession context</div>
      <h1>See how a team<br /><em>uses each trip.</em></h1>
      <p>Possession-level source records make tempo and shot-creation context easier to inspect: how many trips a team plays, how often possessions are marked transition or assisted, and how much of the sample is tagged garbage time.</p>
      <div className="hero-actions"><Link className="button" href="/basketball/learn/">Learn the denominators →</Link><Link className="hero-link" href="/basketball/lineups/">Open lineup lab →</Link></div>
    </div>
    <div className="strip">
      <div><strong>{edition?.coverage.source_rows.toLocaleString() ?? "—"}</strong><span>Source possessions in selected edition</span></div>
      <div><strong>{edition?.coverage.teams.toLocaleString() ?? "—"}</strong><span>Teams with possession rows</span></div>
      <div><strong>{edition?.coverage.games.toLocaleString() ?? "—"}</strong><span>Team-game observations</span></div>
      <div><strong>{seasons.length}</strong><span>Available seasons</span></div>
      <div><strong>{edition ? `${(edition.coverage.invalid_flag_rows ?? 0) + (edition.coverage.invalid_points ?? 0)}` : "—"}</strong><span>Malformed source values disclosed</span></div>
    </div>
    <p className="note" role="status">{status === "live" ? "Cloudflare D1 possession-style archive connected; rows are aggregated from the retained source release." : status === "fallback" ? "Cloudflare D1 archive unavailable; showing the verified bundled release." : "Checking the Cloudflare D1 archive…"}</p>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(event) => { setSeason(event.target.value); setPage(0); }}>{seasons.map((value) => <option value={value} key={value}>{value - 1}–{String(value).slice(-2)}</option>)}</select></label>
      <label className="control"><span>TEAM SEARCH</span><input type="search" maxLength={120} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Program or source ID" /></label>
      <label className="control"><span>SORT</span><select value={sort} onChange={(event) => { setSort(event.target.value as PossessionStyleSort); setPage(0); }}><option value="possessions">Possessions</option><option value="ppp">Points per possession</option><option value="transition">Transition share</option><option value="assisted">Assisted share</option><option value="garbage">Garbage-time share</option><option value="name">Program name</option></select></label>
      <label className="control"><span>ORDER</span><select value={direction} onChange={(event) => { setDirection(event.target.value as "asc" | "desc"); setPage(0); }}><option value="desc">Highest first</option><option value="asc">Lowest first</option></select></label>
    </div>
    {source && <p className="note"><strong>Source receipt:</strong> fetched {source.fetched_at ? date(source.fetched_at) : "—"} · SHA-256 {source.sha256?.slice(0, 16) || "—"}… · {source.url ? <a href={source.url} target="_blank" rel="noreferrer">Open release ↗</a> : "source URL unavailable"}</p>}
    <section className="section paper-panel possession-style-method">
      <div className="section-heading"><div><div className="eyebrow">How to read this</div><h2>Context before conclusions.</h2></div><p>These are source-native descriptive aggregates, not player credit or forecast inputs.</p></div>
      <p>Points per possession is recorded points divided by recorded possessions. Transition, assisted and garbage-time shares use the publisher&apos;s binary possession flags. A missing flag stays unavailable; a zero is an observed zero. Malformed source point and flag values are counted in the edition audit above and never interpreted as positive events. Because each trip belongs to a team, the table does not assign possession credit to any of the five players on the floor.</p>
    </section>
    {error ? <p className="status-error" role="alert">{error}</p> : <>
      <div className="section-heading" style={{ marginTop: 24 }}><p>{total.toLocaleString()} matching team-season rows · page {page + 1} of {pages}</p><button className="button secondary" type="button" onClick={() => downloadCsv(`basketball-possession-style-${season}.csv`, toCsv(["Season", "Program", "Source team ID", "Games", "Possessions", "Points", "Points per possession", "Possessions per game", "Transition share %", "Assisted share %", "Garbage-time share %"], exportRows))}>Download CSV ↓</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Program</th><th className="numeric">GP</th><th className="numeric">Possessions</th><th className="numeric">PTS</th><th className="numeric">PPP</th><th className="numeric">Poss / game</th><th className="numeric">Transition</th><th className="numeric">Assisted</th><th className="numeric">Garbage time</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.season}-${row.team_id}`}><td>{/^\d+$/.test(row.team_id) ? <Link href={`/basketball/programs/${row.team_id}/`}>{row.team_name}</Link> : row.team_name}<small>{row.team_id}</small></td><td className="numeric">{row.games.toLocaleString()}</td><td className="numeric">{row.possessions.toLocaleString()}</td><td className="numeric">{row.points.toLocaleString()}</td><td className="numeric"><strong>{num(row.points_per_possession, 3)}</strong></td><td className="numeric">{num(row.possessions_per_game, 1)}</td><td className="numeric">{pct(row.transition_share)}</td><td className="numeric">{pct(row.assisted_share)}</td><td className="numeric">{pct(row.garbage_time_share)}</td></tr>)}</tbody></table></div>
      {!rows.length && <p className="empty">No teams match this view.</p>}
      <div className="pagination"><span>{total.toLocaleString()} rows · source IDs remain attributable</span><div><button className="button secondary" type="button" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button></div></div>
    </>}
    <p className="note" style={{ marginTop: 20 }}>Source: SportsDataverse <a href="https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/ncaa_mbb_possessions" target="_blank" rel="noreferrer">NCAA men&apos;s basketball possession release ↗</a>. Silvermine stores the source receipt and derived team-season aggregates; raw player identities are not inferred from lineup membership.</p>
  </>;
}
