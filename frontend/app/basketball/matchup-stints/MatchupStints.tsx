"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { date, fmt, signed } from "../../_lib/format";
import {
  matchupStintFilterSearch,
  parseMatchupStintFilters,
  sortMatchupStints,
  type MatchupStint,
  type MatchupStintEdition,
  type MatchupStintSort,
} from "../../_lib/matchup-stints";

type CatalogSeason = {
  season: number;
  generated_at: string;
  coverage: MatchupStintEdition["coverage"];
  path: string;
  source?: { sha256?: string };
};
type Catalog = { default_season: number; seasons: CatalogSeason[] };

const fallbackSeasons = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019];
const seasonLabel = (season: number) => `${season - 1}–${String(season).slice(-2)}`;

export default function MatchupStints() {
  const initial = typeof window === "undefined"
    ? parseMatchupStintFilters("", fallbackSeasons, 2026)
    : parseMatchupStintFilters(window.location.search, fallbackSeasons, 2026);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [season, setSeason] = useState(initial.season);
  const [query, setQuery] = useState(initial.query);
  const [minPoss, setMinPoss] = useState(initial.minPoss);
  const [sort, setSort] = useState<MatchupStintSort>(initial.sort);
  const [edition, setEdition] = useState<MatchupStintEdition | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const next = matchupStintFilterSearch({ season, query, minPoss, sort }, catalog?.default_season ?? 2026);
    if (next !== window.location.search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
  }, [catalog?.default_season, minPoss, query, season, sort]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/matchup-stints.json", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("The matchup catalog is unavailable."); return response.json() as Promise<Catalog>; })
      .then((value) => {
        setCatalog(value);
        if (!value.seasons.some((entry) => entry.season === season)) setSeason(value.default_season);
      })
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
      .then((response) => { if (!response.ok) throw new Error("The matchup edition could not be loaded."); return response.json() as Promise<MatchupStintEdition>; })
      .then(setEdition)
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [catalog, season]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (edition?.matchups ?? []).filter((row) => {
      if (row.possessions < Number(minPoss)) return false;
      if (!needle) return true;
      return [row.home, row.away, ...row.home_lineup, ...row.away_lineup].some((value) => value.toLowerCase().includes(needle));
    });
    return sortMatchupStints(rows, sort);
  }, [edition, minPoss, query, sort]);
  const visible = filtered.slice(0, 40);
  const activeCoverage = edition?.coverage;
  const totalPossessions = catalog?.seasons.reduce((sum, entry) => sum + entry.coverage.source_possessions, 0) ?? 0;
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("Matchup link copied."); }
    catch { setCopied("Copy the filtered URL from your address bar."); }
  };
  const reset = (fn: () => void) => { fn(); };

  return <>
    <div className="dateline eyebrow"><span>Evidence archive / five-v-five matchups</span><span>{catalog?.seasons.length ?? 8} seasons · source-derived</span></div>
    <div className="page-title"><div className="eyebrow">The matchup stint archive</div><h1>See the five<br /><em>across the five.</em></h1><p>Find the lineups that actually shared the floor. This archive pairs each source-native five-player lineup with the opposing five, so a coach can inspect possessions, scoring margin and repeat-game evidence before building a matchup plan.</p></div>
    <div className="strip"><div><strong>{fmt(activeCoverage?.published_matchups, 0)}</strong><span>Published pairs in view</span></div><div><strong>{fmt(activeCoverage?.source_contests, 0)}</strong><span>Source contests</span></div><div><strong>{fmt(activeCoverage?.source_possessions, 0)}</strong><span>Possessions in season</span></div><div><strong>{fmt(totalPossessions, 0)}</strong><span>Eight-season possessions</span></div></div>
    <section className="section">
      <div className="section-heading"><div><div className="eyebrow">Five-player matchup finder</div><h2>Who shared the floor?</h2></div><span className="note">Top {fmt(activeCoverage?.published_matchups, 0)} high-volume pairs · {seasonLabel(season)}</span></div>
      <div className="toolbar">
        <label className="control"><span>SEASON</span><select value={season} onChange={(event) => reset(() => setSeason(Number(event.target.value)))}>{(catalog?.seasons ?? fallbackSeasons.map((value) => ({ season: value } as CatalogSeason))).slice().sort((a, b) => b.season - a.season).map((entry) => <option key={entry.season} value={entry.season}>{seasonLabel(entry.season)}</option>)}</select></label>
        <label className="control"><span>TEAM OR PLAYER</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search either five" /></label>
        <label className="control"><span>MINIMUM POSSESSIONS</span><select value={minPoss} onChange={(event) => reset(() => setMinPoss(event.target.value))}><option value="0">All samples</option><option value="20">20+</option><option value="40">40+</option><option value="100">100+</option><option value="200">200+</option></select></label>
        <label className="control"><span>ORDER</span><select value={sort} onChange={(event) => reset(() => setSort(event.target.value as MatchupStintSort))}><option value="possessions">Most possessions</option><option value="net_per_100">Largest home edge</option><option value="games">Most games</option><option value="date">Most recent</option></select></label>
        <button className="button secondary" type="button" onClick={share}>Copy matchup link</button>
        <a className="button secondary" href={`/api/basketball/research/matchup-stints/source?season=${encodeURIComponent(String(season))}`}>Download source parquet ↓</a>
      </div>
      {copied && <p role="status">{copied}</p>}
      {error ? <p role="alert" className="status-error">{error}</p> : !edition ? <p role="status" className="empty">Loading matchup rows…</p> : <>
        <div className="section-heading" style={{ marginBottom: 20 }}><p>{fmt(filtered.length, 0)} pairs match · showing {fmt(visible.length, 0)}</p><button className="button secondary" type="button" onClick={() => downloadCsv(`basketball-matchup-stints-${season}.csv`, toCsv(["Season", "Home", "Away", "Home five", "Away five", "Net / 100", "Possessions", "Games", "Minutes", "Last date"], filtered.map((row) => [seasonLabel(row.season), row.home, row.away, row.home_lineup.join(" / "), row.away_lineup.join(" / "), row.net_per_100, row.possessions, row.games, row.duration_mins, row.last_date])))}>Download CSV ↓</button></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Matchup</th><th>Home five</th><th>Away five</th><th className="numeric">Home edge / 100</th><th className="numeric">Poss.</th><th className="numeric">Games</th><th className="numeric">Minutes</th><th>Last shared</th></tr></thead><tbody>{visible.map((row: MatchupStint) => <tr key={row.id}><td><strong>{row.home}</strong><small>vs {row.away}</small></td><td>{row.home_lineup.join(" · ")}</td><td>{row.away_lineup.join(" · ")}</td><td className="numeric">{row.net_per_100 == null ? "—" : signed(row.net_per_100)}</td><td className="numeric">{fmt(row.possessions, 0)}</td><td className="numeric">{fmt(row.games, 0)}</td><td className="numeric">{fmt(row.duration_mins, 1)}</td><td>{row.last_date ? date(row.last_date) : "—"}</td></tr>)}</tbody></table></div>
        {!visible.length && <p className="empty">No source-derived pairs match these filters.</p>}
      </>}
    </section>
    <section className="section paper-panel"><h2>How to use the archive.</h2><p>These are source-derived stints, not a projection. The public edition keeps the 5,000 highest-possession lineup pairs per season; possessions and games remain visible so a small sample does not look like a stable matchup. “Home edge / 100” is home points minus away points per 100 shared possessions.</p><p>Player and team labels remain publisher-native and are not joined to a universal identity graph. Raw parquet releases and retrieval receipts are retained in the research archive for reproducibility. Source: <a href="https://github.com/sportsdataverse/sportsdataverse-data" target="_blank" rel="noreferrer">SportsDataverse</a>, CC BY 4.0.</p></section>
  </>;
}
