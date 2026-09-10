"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { completeStatsSum, effectiveFieldGoal, safeSum, trueShooting } from "../../_lib/ncaa-player-box";

type Stats = Record<string, number | null>;
type SeasonRow = { season: number; team_id: string; team_name: string | null; player_name: string | null; games: number; stats: Stats };
type RosterRow = { season: number; team_name: string | null; player_name: string | null; profile: Record<string, string | number | null> };
type Card = { player_id: string; selected_season: number; seasons: SeasonRow[]; rosters: RosterRow[]; identity_note: string };
type Impact = { season: number; player_id: string; orapm: number | null; drapm: number | null; rapm_net: number | null; qualified: boolean; rank: number | null };
type SearchRow = { player_id: string; player_name: string | null; team_id: string; team_name: string | null; games: number; points: number | null };

const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const format = (value: number | null, digits = 1) => value == null ? "—" : value.toFixed(digits);
const percent = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;

function PlayerColumn({ card, season, impact }: { card: Card; season: number; impact: Impact | undefined }) {
  const rows = card.seasons.filter((row) => row.season === season);
  const roster = card.rosters.find((row) => row.season === season);
  const totals = useMemo(() => {
    if (!rows.length) return null;
    const sum = (key: string) => completeStatsSum(rows, key);
    const games = rows.reduce((total, row) => total + (Number(row.games) || 0), 0);
    const points = sum("pts");
    const rebounds = safeSum(sum("orb"), sum("drb"));
    const assists = sum("ast");
    const minutes = sum("mins");
    const fga = sum("fga");
    const fgm = sum("fgm");
    const tpm = sum("tpm");
    const fta = sum("fta");
    const turnovers = sum("tov");
    const fouls = sum("pf");
    return { games, points, rebounds, assists, turnovers, fouls, minutes, fga, fgm, tpm, fta, ts: trueShooting({ pts: points, fga, fta }), efg: effectiveFieldGoal(fgm, tpm, fga) };
  }, [rows]);
  const name = rows[0]?.player_name || roster?.player_name || `NCAA player ${card.player_id}`;
  return <article className="paper-panel">
    <div className="eyebrow">NCAA source ID {card.player_id}</div>
    <h2>{name}</h2>
    <p className="note">{rows.map((row) => row.team_name || row.team_id).join(" · ") || "No selected-season team row"}</p>
    <div className="hero-actions"><Link className="hero-link" href={`/basketball/ncaa-player/?id=${encodeURIComponent(card.player_id)}&season=${season}`}>Open full player card →</Link><a className="hero-link" href={`https://stats.ncaa.org/players/${encodeURIComponent(card.player_id)}`} target="_blank" rel="noreferrer">NCAA source ↗</a></div>
    {!totals ? <p className="empty">No source row for {label(season)}.</p> : <>
      <div className="strip"><div><strong>{totals.games || "—"}</strong><span>Games</span></div><div><strong>{format(totals.points == null || !totals.games ? null : totals.points / totals.games)}</strong><span>Points / game</span></div><div><strong>{format(totals.rebounds == null || !totals.games ? null : totals.rebounds / totals.games)}</strong><span>Rebounds / game</span></div><div><strong>{format(totals.assists == null || !totals.games ? null : totals.assists / totals.games)}</strong><span>Assists / game</span></div><div><strong>{format(totals.turnovers == null || !totals.games ? null : totals.turnovers / totals.games)}</strong><span>Turnovers / game</span></div><div><strong>{format(totals.fouls == null || !totals.games ? null : totals.fouls / totals.games)}</strong><span>Fouls / game</span></div></div>
      <dl className="raw-stat-grid"><div><dt>True shooting</dt><dd>{percent(totals.ts)}</dd></div><div><dt>Effective FG</dt><dd>{percent(totals.efg)}</dd></div><div><dt>Minutes / game</dt><dd>{format(totals.minutes == null || !totals.games ? null : totals.minutes / totals.games)}</dd></div><div><dt>Class / position</dt><dd>{roster?.profile.class || "—"} · {roster?.profile.position || "—"}</dd></div><div><dt>Net RAPM</dt><dd>{format(impact?.rapm_net ?? null, 2)}</dd></div><div><dt>RAPM status</dt><dd>{impact?.qualified ? "Qualified sample" : "Unavailable / unqualified"}</dd></div></dl>
      <p className="note">Totals pool the source&apos;s team rows for the selected season. Rates use only recorded attempts and remain unavailable when their denominator is missing.</p>
    </>}
  </article>;
}

export default function NcaaCompare() {
  const params = useSearchParams();
  const [season, setSeason] = useState(Number(params.get("season")) || 2026);
  const [input, setInput] = useState(params.get("ids") || "");
  const [search, setSearch] = useState("");
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [ids, setIds] = useState(() => (params.get("ids") || "").split(",").map((id) => id.trim()).filter((id) => /^\d{1,15}$/.test(id)).slice(0, 3));
  const [cards, setCards] = useState<Card[]>([]);
  const [impact, setImpact] = useState<Impact[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    const next = new URL(window.location.href);
    if (ids.length) next.searchParams.set("ids", ids.join(",")); else next.searchParams.delete("ids");
    next.searchParams.set("season", String(season));
    window.history.replaceState(null, "", next);
  }, [ids, season]);
  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setSearchRows([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => fetch(`/api/basketball/research/ncaa-player-rankings?season=${season}&metric=ppg&minGames=1&minMinutes=0&q=${encodeURIComponent(query)}&page=0`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ rows: SearchRow[] }> : Promise.reject(new Error("The NCAA player search could not be loaded.")))
      .then((payload) => { if (!controller.signal.aborted) { const unique = payload.rows.filter((row, index, all) => all.findIndex((candidate) => candidate.player_id === row.player_id) === index); setSearchRows(unique.slice(0, 8)); } })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The NCAA player search could not be loaded."); }));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, season]);
  useEffect(() => {
    if (!ids.length) { setCards([]); setImpact([]); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    Promise.all([
      Promise.all(ids.map((id) => fetch(`/api/basketball/research/ncaa-player-card/${encodeURIComponent(id)}?season=${season}`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(`NCAA player ${id} was not found.`); return response.json() as Promise<Card>; }))),
      fetch("/data/basketball/impact.json", { signal: controller.signal }).then((response) => response.ok ? response.json() as Promise<{ players: Impact[] }> : { players: [] }).catch(() => ({ players: [] })),
    ]).then(([nextCards, release]) => { if (!controller.signal.aborted) { setCards(nextCards); setImpact(release.players); } }).catch((reason) => { if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The NCAA comparison could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ids, season]);
  const submit = () => {
    const next = input.split(/[\s,]+/).map((id) => id.trim()).filter((id, index, all) => /^\d{1,15}$/.test(id) && all.indexOf(id) === index).slice(0, 3);
    setIds(next);
    if (!next.length) setError("Enter one to three numeric NCAA player source IDs.");
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Comparison link copied.");
    } catch {
      setCopied("Copy the comparison URL from your address bar.");
    }
  };
  return <>
    <div className="page-title"><div className="eyebrow">NCAA source archive / player comparison</div><h1>Put the<br /><em>profiles together.</em></h1><p>Compare up to three NCAA source IDs across the same season. This keeps the identity namespace exact while giving a coach a quick production, shooting, roster and impact read.</p></div>
    <section className="paper-panel" style={{ marginBottom: 24 }}><div className="toolbar"><label className="control"><span>STAT SEASON</span><select value={season} onChange={(event) => setSeason(Number(event.target.value))}>{Array.from({ length: 17 }, (_, index) => 2026 - index).map((year) => <option value={year} key={year}>{label(year)}</option>)}</select></label><label className="control" style={{ flex: 1 }}><span>NCAA PLAYER SOURCE IDS</span><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="Example: 123456, 234567" maxLength={60} /></label><button className="button" type="button" onClick={submit}>Compare players</button></div><div className="toolbar" style={{ marginTop: 12 }}><label className="control" style={{ flex: 1 }}><span>FIND BY PLAYER OR PROGRAM</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a name or school, then add a result" maxLength={120} /></label></div>{searchRows.length > 0 && <div className="table-scroll" style={{ marginTop: 12 }}><table className="data-table"><thead><tr><th>Player</th><th>Program</th><th className="numeric">GP</th><th className="numeric">PTS / game</th><th /></tr></thead><tbody>{searchRows.map((row) => <tr key={`${row.player_id}-${row.team_id}`}><td><strong>{row.player_name || row.player_id}</strong><small>NCAA player {row.player_id}</small></td><td>{row.team_name || row.team_id}</td><td className="numeric">{row.games || "—"}</td><td className="numeric">{row.points == null || !row.games ? "—" : (row.points / row.games).toFixed(1)}</td><td className="numeric"><button className="button secondary" type="button" disabled={ids.includes(row.player_id) || ids.length >= 3} onClick={() => { const next = [...ids, row.player_id].slice(0, 3); setIds(next); setInput(next.join(", ")); }}> {ids.includes(row.player_id) ? "Added" : ids.length >= 3 ? "Full" : "Add"} </button></td></tr>)}</tbody></table></div>}<p className="note">Find IDs from the <Link href="/basketball/ncaa-rankings/">NCAA player rankings</Link>, player box archive or an NCAA source link. Search results are only a discovery aid; comparison requests still load and join records by exact NCAA source ID.</p></section>
    {error && <p className="status-error" role="alert">{error}</p>}
    {loading && <p className="empty" role="status">Loading source-native player cards…</p>}
    {!loading && !cards.length && <section className="paper-panel"><h2>Start with source IDs.</h2><p>Enter one to three numeric NCAA player IDs to compare their selected-season evidence side by side. A single ID is useful when you want a compact season summary before opening the full card.</p></section>}
    {!loading && cards.length > 0 && <><div className="strip"><div><strong>{cards.length}</strong><span>Players compared</span></div><div><strong>{label(season)}</strong><span>Selected season</span></div><div><strong>NCAA</strong><span>Identity namespace</span></div><div><strong>Exact ID</strong><span>Join method</span></div></div><section className="section"><div className="section-heading"><div><div className="eyebrow">Side-by-side evidence</div><h2>Read the shape of the season.</h2></div><div className="button-row"><span className="note">Source rows pooled by player ID and season</span><button className="button secondary" type="button" onClick={share}>Copy comparison link</button></div></div>{copied && <p role="status">{copied}</p>}<div className="two-col">{cards.map((card) => <PlayerColumn key={card.player_id} card={card} season={season} impact={impact.find((row) => row.season === season && row.player_id === card.player_id)} />)}</div></section><p className="note">Source: NCAA-derived player and roster releases via SportsDataverse, with exact-ID RAPM where available. This comparison is descriptive evidence for scouting and study; it does not assert eligibility, current roster membership or an ESPN identity match.</p></>}
  </>;
}
