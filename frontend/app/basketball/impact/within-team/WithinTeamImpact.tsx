"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../../_lib/csv";
import { fmt, signed } from "../../../_lib/format";
import {
  parseWithinImpactFilters,
  sortWithinImpact,
  withinImpactFilterSearch,
  type WithinImpactEdition,
  type WithinImpactFilters,
  type WithinImpactRow,
  type WithinImpactSort,
} from "../../../_lib/within-impact";

type CatalogSeason = { season: number; generated_at: string; coverage: WithinImpactEdition["coverage"]; path: string };
type Catalog = { default_season: number; seasons: CatalogSeason[] };
const fallbackSeasons = Array.from({ length: 17 }, (_, index) => 2026 - index);
const seasonLabel = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const sortLabels: Record<WithinImpactSort, string> = {
  rank: "Publisher rank",
  rapm_net: "Net RAPM",
  rapm_off: "Offensive RAPM",
  rapm_def: "Defensive RAPM",
  possessions: "Team possessions",
};

export default function WithinTeamImpact() {
  const initial = typeof window === "undefined"
    ? parseWithinImpactFilters("", fallbackSeasons, 2026)
    : parseWithinImpactFilters(window.location.search, fallbackSeasons, 2026);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [season, setSeason] = useState(initial.season);
  const [query, setQuery] = useState(initial.query);
  const [minPoss, setMinPoss] = useState(initial.minPoss);
  const [sort, setSort] = useState<WithinImpactSort>(initial.sort);
  const [edition, setEdition] = useState<WithinImpactEdition | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const next = withinImpactFilterSearch({ season, query, minPoss, sort }, catalog?.default_season ?? 2026);
    if (next !== window.location.search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
  }, [catalog?.default_season, minPoss, query, season, sort]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/impact-within-team.json", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The within-team impact catalog is unavailable."); return response.json() as Promise<Catalog>; })
      .then((value) => { setCatalog(value); if (!value.seasons.some((entry) => entry.season === season)) setSeason(value.default_season); })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!catalog) return;
    const selected = catalog.seasons.find((entry) => entry.season === season) ?? catalog.seasons[0];
    if (!selected) return;
    const controller = new AbortController();
    setEdition(null);
    setError("");
    fetch(selected.path, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The within-team impact edition could not be loaded."); return response.json() as Promise<WithinImpactEdition>; })
      .then(setEdition)
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [catalog, season]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (edition?.players ?? []).filter((row) => row.team_off_poss != null && row.team_off_poss >= Number(minPoss) && (!needle || `${row.player} ${row.player_code} ${row.team} ${row.player_id}`.toLowerCase().includes(needle)));
    return sortWithinImpact(rows, sort);
  }, [edition, minPoss, query, sort]);
  const visible = filtered.slice(0, 60);
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("Impact link copied."); }
    catch { setCopied("Copy the filtered URL from your address bar."); }
  };
  const reset = (fn: () => void) => fn();
  return <>
    <div className="dateline eyebrow"><span>Player impact / within-team RAPM</span><span>{catalog?.seasons.length ?? 17} seasons · source-derived</span></div>
    <div className="page-title"><div className="eyebrow">The within-team impact archive</div><h1>Measure impact<br /><em>in the team context.</em></h1><p>Read the source&apos;s within-team adjusted plus-minus alongside playing volume and roster size. It answers a different question from league-wide RAPM: which players moved their team&apos;s results relative to the teammates in the same model?</p><div className="hero-actions"><a className="hero-link" href="/basketball/impact/">Open league-wide RAPM →</a></div></div>
    <div className="strip"><div><strong>{fmt(edition?.coverage.players, 0)}</strong><span>Players in view</span></div><div><strong>{fmt(edition?.coverage.teams, 0)}</strong><span>Teams in season</span></div><div><strong>{fmt(edition?.coverage.qualified, 0)}</strong><span>500+ possession samples</span></div><div><strong>{catalog?.seasons.length ?? 17}</strong><span>Published seasons</span></div></div>
    <section className="section">
      <div className="section-heading"><div><div className="eyebrow">Source impact finder</div><h2>Compare players within their team.</h2></div><span className="note">{seasonLabel(season)} · one row per source player/team</span></div>
      <div className="toolbar">
        <label className="control"><span>SEASON</span><select value={season} onChange={(event) => reset(() => setSeason(Number(event.target.value)))}>{(catalog?.seasons ?? fallbackSeasons.map((value) => ({ season: value } as CatalogSeason))).slice().sort((a, b) => b.season - a.season).map((entry) => <option key={entry.season} value={entry.season}>{seasonLabel(entry.season)}</option>)}</select></label>
        <label className="control"><span>PLAYER OR TEAM</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source names or teams" /></label>
        <label className="control"><span>MINIMUM TEAM POSSESSIONS</span><select value={minPoss} onChange={(event) => reset(() => setMinPoss(event.target.value))}><option value="0">All samples</option><option value="200">200+</option><option value="500">500+</option><option value="1000">1,000+</option><option value="1500">1,500+</option></select></label>
        <label className="control"><span>ORDER</span><select value={sort} onChange={(event) => reset(() => setSort(event.target.value as WithinImpactSort))}>{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="button secondary" type="button" onClick={share}>Copy impact link</button>
      </div>
      {copied && <p role="status">{copied}</p>}
      {error ? <p role="alert" className="status-error">{error}</p> : !edition ? <p role="status" className="empty">Loading within-team impact rows…</p> : <>
        <div className="section-heading" style={{ marginBottom: 20 }}><p>{fmt(filtered.length, 0)} matching players · showing {fmt(visible.length, 0)}</p><button className="button secondary" type="button" onClick={() => downloadCsv(`basketball-within-team-impact-${season}.csv`, toCsv(["Season", "Rank", "Player", "Source player code", "Team", "Player ID", "ORAPM", "DRAPM", "Net RAPM", "Team possessions", "Players in team model"], filtered.map((row) => [seasonLabel(row.season), row.rank, row.player, row.player_code, row.team, row.player_id, row.rapm_off, row.rapm_def, row.rapm_net, row.team_off_poss, row.num_players])))}>Download CSV ↓</button></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player / NCAA identity</th><th>Team</th><th className="numeric">ORAPM</th><th className="numeric">DRAPM</th><th className="numeric">Net</th><th className="numeric">Team poss.</th><th className="numeric">Model players</th></tr></thead><tbody>{visible.map((row: WithinImpactRow) => <tr key={`${row.season}-${row.player_id}-${row.team_id}`}><td className="rank-number">{row.rank ?? "—"}</td><td><strong>{row.player}</strong><small>{row.player_code}</small><small>NCAA source ID {row.player_id}</small></td><td>{row.team}</td><td className="numeric">{row.rapm_off == null ? "—" : signed(row.rapm_off)}</td><td className="numeric">{row.rapm_def == null ? "—" : signed(row.rapm_def)}</td><td className="numeric">{row.rapm_net == null ? "—" : signed(row.rapm_net)}</td><td className="numeric">{fmt(row.team_off_poss, 0)}</td><td className="numeric">{fmt(row.num_players, 0)}</td></tr>)}</tbody></table></div>
        {!visible.length && <p className="empty">No source impact rows match these filters.</p>}
      </>}
    </section>
    <section className="section paper-panel"><h2>How to read this measure.</h2><p>Within-team RAPM is a source-published regularized plus-minus estimate. The release supplies team offensive possessions as the volume field and does not provide a separate defensive-possession column, so the 500-possession filter is defined on the available team sample. A positive net value is descriptive evidence within that team-season; it is not a transfer grade, a forecast feature or a claim that a player would have the same value in a different program.</p><p>Source player codes, NCAA IDs and team IDs remain in the publisher&apos;s namespace. The archive is separate from the league-wide NCAA RAPM board and the Silvermine forecast. Source: <a href="https://github.com/sportsdataverse/sportsdataverse-data" target="_blank" rel="noreferrer">SportsDataverse</a>, CC BY 4.0.</p></section>
  </>;
}
