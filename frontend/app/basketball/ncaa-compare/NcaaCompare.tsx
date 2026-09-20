"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { completeStatsSum, effectiveFieldGoal, playerAdvancedRates, safeSum, trueShooting } from "../../_lib/ncaa-player-box";
import { exactRankingContextRows, rankingContextLabel, rankingContextSpecs, rankingRoleContext, type RankingContextRow } from "../../_lib/ncaa-ranking-context";

type Stats = Record<string, number | null>;
type SeasonRow = { season: number; team_id: string; team_name: string | null; player_name: string | null; games: number; stats: Stats };
type RosterRow = { season: number; team_name: string | null; player_name: string | null; profile: Record<string, string | number | null> };
type Card = { player_id: string; selected_season: number; seasons: SeasonRow[]; rosters: RosterRow[]; identity_note: string };
type Impact = { season: number; player_id: string; orapm: number | null; drapm: number | null; rapm_net: number | null; qualified: boolean; rank: number | null };
type SearchRow = { player_id: string; player_name: string | null; team_id: string; team_name: string | null; games: number; points: number | null };
type SourceReceipt = { dataset: string; season: number; fetched_at: string; sha256: string };
type ComparisonPayload = { season: number; requested_ids: string[]; missing_ids: string[]; cards: Card[]; source_receipts: SourceReceipt[]; identity_policy: string };
type RankingPayload = { metric: RankingContextRow["metric"]; total: number; rows: Array<Omit<RankingContextRow, "metric" | "total">> };

const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const format = (value: number | null, digits = 1) => value == null ? "—" : value.toFixed(digits);
const percent = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;

export function comparisonPossessionContext(rows: SeasonRow[]) {
  const total = (key: string) => completeStatsSum(rows, key);
  const points = total("pts");
  const possessions = total("o_poss");
  const assists = total("ast");
  const turnovers = total("tov");
  const fieldGoalAttempts = total("fga");
  const threesMade = total("tpm");
  const threesAttempted = total("tpa");
  const freeThrowsMade = total("ftm");
  const freeThrowsAttempted = total("fta");
  return {
    points,
    possessions,
    assists,
    turnovers,
    fieldGoalAttempts,
    threesMade,
    threesAttempted,
    freeThrowsMade,
    freeThrowsAttempted,
    rates: playerAdvancedRates({
      pts: points,
      o_poss: possessions,
      ast: assists,
      tov: turnovers,
      fga: fieldGoalAttempts,
      tpa: threesAttempted,
      fta: freeThrowsAttempted,
    }),
  };
}

function PlayerColumn({ card, season, impact, rankingRows }: { card: Card; season: number; impact: Impact | undefined; rankingRows: RankingContextRow[] }) {
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
    const tpa = sum("tpa");
    const fta = sum("fta");
    const ftm = sum("ftm");
    const turnovers = sum("tov");
    const fouls = sum("pf");
    const possessionContext = comparisonPossessionContext(rows);
    return { games, points, rebounds, assists, turnovers, fouls, minutes, fga, fgm, tpm, tpa, fta, ftm, ts: trueShooting({ pts: points, fga, fta }), efg: effectiveFieldGoal(fgm, tpm, fga), possessionContext };
  }, [rows]);
  const name = rows[0]?.player_name || roster?.player_name || `Player ${card.player_id}`;
  const exactRows = rankingRows.filter((row) => row.player_id === card.player_id);
  return <article className="paper-panel">
    <div className="eyebrow">Player ID {card.player_id}</div>
    <h2>{name}</h2>
    <p className="note">{rows.map((row) => row.team_name || row.team_id).join(" · ") || "No selected-season team row"}</p>
    <div className="hero-actions"><Link className="hero-link" href={`/basketball/ncaa-player/?id=${encodeURIComponent(card.player_id)}&season=${season}`}>Open full player card →</Link></div>
    {!totals ? <p className="empty">No source row for {label(season)}.</p> : <>
      <div className="strip"><div><strong>{totals.games || "—"}</strong><span>Games</span></div><div><strong>{format(totals.points == null || !totals.games ? null : totals.points / totals.games)}</strong><span>Points / game</span></div><div><strong>{format(totals.rebounds == null || !totals.games ? null : totals.rebounds / totals.games)}</strong><span>Rebounds / game</span></div><div><strong>{format(totals.assists == null || !totals.games ? null : totals.assists / totals.games)}</strong><span>Assists / game</span></div><div><strong>{format(totals.turnovers == null || !totals.games ? null : totals.turnovers / totals.games)}</strong><span>Turnovers / game</span></div><div><strong>{format(totals.fouls == null || !totals.games ? null : totals.fouls / totals.games)}</strong><span>Fouls / game</span></div></div>
      <dl className="raw-stat-grid"><div><dt>True shooting</dt><dd>{percent(totals.ts)}</dd></div><div><dt>Effective FG</dt><dd>{percent(totals.efg)}</dd></div><div><dt>Minutes / game</dt><dd>{format(totals.minutes == null || !totals.games ? null : totals.minutes / totals.games)}</dd></div><div><dt>Points / recorded possession</dt><dd>{format(totals.possessionContext.rates.pointsPerPossession, 3)}</dd></div><div><dt>Assists / recorded possession</dt><dd>{percent(totals.possessionContext.rates.assistRate)}</dd></div><div><dt>Turnovers / recorded possession</dt><dd>{percent(totals.possessionContext.rates.turnoverRate)}</dd></div><div><dt>3-point attempt rate</dt><dd>{percent(totals.possessionContext.rates.threePointAttemptRate)}</dd></div><div><dt>Free-throw attempt rate</dt><dd>{percent(totals.possessionContext.rates.freeThrowAttemptRate)}</dd></div><div><dt>Class / position</dt><dd>{roster?.profile.class || "—"} · {roster?.profile.position || "—"}</dd></div><div><dt>Net RAPM</dt><dd>{format(impact?.rapm_net ?? null, 2)}</dd></div><div><dt>RAPM status</dt><dd>{impact?.qualified ? "Qualified sample" : "Unavailable / unqualified"}</dd></div></dl>
      <p className="note">Recorded evidence: {format(totals.possessionContext.points, 0)} PTS / {format(totals.possessionContext.possessions, 0)} POSS · {format(totals.assists, 0)} AST · {format(totals.turnovers, 0)} TO · FG {format(totals.fgm, 0)}/{format(totals.fga, 0)} · 3P {format(totals.tpm, 0)}/{format(totals.tpa, 0)} · FT {format(totals.ftm, 0)}/{format(totals.fta, 0)}.</p>
      <p className="note">Totals pool exact-ID team rows for the selected season. Every derived rate requires its complete recorded numerator and denominator across all team stints; a missing source field keeps that rate unavailable.</p>
      <section className="comparison-ranking-context" aria-label={`${name} ranking and role context`}>
        <div className="eyebrow">Ranking and role context</div>
        <h3>Place the production in a qualified cohort.</h3>
        <p className="note">Each row uses an exact player ID and team ID from the ranking archive. A missing board means this ID did not clear that board&apos;s stated sample; it does not imply a zero.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Board</th><th>Rank</th><th>Role / denominator</th></tr></thead><tbody>{rankingContextSpecs.map((spec) => { const matches = exactRows.filter((row) => row.metric === spec.metric); return matches.length ? matches.map((row) => <tr key={`${spec.metric}-${row.team_id}`}><th scope="row">{rankingContextLabel(spec, row)}<small>{row.team_name || row.team_id} · {spec.description} · {spec.minGames} GP / {spec.minMinutes} MIN{spec.minVolume ? ` / ${spec.minVolume} volume` : ""}</small></th><td>{row.rank == null ? "—" : `#${row.rank} / ${row.total.toLocaleString()}`}</td><td>{rankingRoleContext(row) || "Required role denominator unavailable"}</td></tr>) : <tr key={spec.metric}><th scope="row">{spec.label}<small>{spec.description} · {spec.minGames} GP / {spec.minMinutes} MIN{spec.minVolume ? ` / ${spec.minVolume} volume` : ""}</small></th><td colSpan={2}>Sample not met or board unavailable</td></tr>; })}</tbody></table></div>
      </section>
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
  const [sourceReceipts, setSourceReceipts] = useState<SourceReceipt[]>([]);
  const [rankingRows, setRankingRows] = useState<RankingContextRow[]>([]);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [identityPolicy, setIdentityPolicy] = useState("");
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
      .then((response) => response.ok ? response.json() as Promise<{ rows: SearchRow[] }> : Promise.reject(new Error("The player search could not be loaded.")))
      .then((payload) => { if (!controller.signal.aborted) { const unique = payload.rows.filter((row, index, all) => all.findIndex((candidate) => candidate.player_id === row.player_id) === index); setSearchRows(unique.slice(0, 8)); } })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The player search could not be loaded."); }));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, season]);
  useEffect(() => {
    if (!ids.length) { setCards([]); setImpact([]); setRankingRows([]); setSourceReceipts([]); setMissingIds([]); setIdentityPolicy(""); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    const rankingRequests = rankingContextSpecs.map(async (spec) => {
      try {
        const query = new URLSearchParams({ season: String(season), metric: spec.metric, minGames: String(spec.minGames), minMinutes: String(spec.minMinutes), minVolume: String(spec.minVolume), playerIds: ids.join(","), page: "0" });
        const response = await fetch(`/api/basketball/research/ncaa-player-rankings?${query.toString()}`, { signal: controller.signal });
        if (!response.ok) return null;
        return await response.json() as RankingPayload;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
        return null;
      }
    });
    Promise.all([
      fetch(`/api/basketball/research/ncaa-player-comparison?season=${season}&ids=${encodeURIComponent(ids.join(","))}`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("The exact-ID player comparison could not be loaded."); return response.json() as Promise<ComparisonPayload>; }),
      fetch(`/data/basketball/impact-${season}.json`, { signal: controller.signal }).then((response) => response.ok ? response.json() as Promise<{ players: Impact[] }> : { players: [] }).catch(() => ({ players: [] })),
      Promise.all(rankingRequests),
    ]).then(([comparison, release, rankings]) => { if (!controller.signal.aborted) { setCards(comparison.cards); setSourceReceipts(comparison.source_receipts); setMissingIds(comparison.missing_ids); setIdentityPolicy(comparison.identity_policy); setImpact(release.players); setRankingRows(rankings.flatMap((payload) => payload ? payload.rows.map((row) => ({ ...row, metric: payload.metric, total: payload.total })) : [])); } }).catch((reason) => { if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : "The player comparison could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ids, season]);
  const submit = () => {
    const next = input.split(/[\s,]+/).map((id) => id.trim()).filter((id, index, all) => /^\d{1,15}$/.test(id) && all.indexOf(id) === index).slice(0, 3);
    setIds(next);
    if (!next.length) setError("Enter one to three numeric player IDs.");
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
    <div className="page-title"><div className="eyebrow">Player comparison archive</div><h1>Put the<br /><em>profiles together.</em></h1><p>Compare up to three player IDs across the same season. This keeps the identity namespace exact while giving a quick production, shooting, roster and impact read.</p></div>
    <section className="paper-panel" style={{ marginBottom: 24 }}><div className="toolbar"><label className="control"><span>STAT SEASON</span><select value={season} onChange={(event) => setSeason(Number(event.target.value))}>{Array.from({ length: 17 }, (_, index) => 2026 - index).map((year) => <option value={year} key={year}>{label(year)}</option>)}</select></label><label className="control" style={{ flex: 1 }}><span>PLAYER IDS</span><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="Example: 123456, 234567" maxLength={60} /></label><button className="button" type="button" onClick={submit}>Compare players</button></div><div className="toolbar" style={{ marginTop: 12 }}><label className="control" style={{ flex: 1 }}><span>FIND BY PLAYER OR PROGRAM</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a name or school, then add a result" maxLength={120} /></label></div>{searchRows.length > 0 && <div className="table-scroll" style={{ marginTop: 12 }}><table className="data-table"><thead><tr><th>Player</th><th>Program</th><th className="numeric">GP</th><th className="numeric">PTS / game</th><th /></tr></thead><tbody>{searchRows.map((row) => <tr key={`${row.player_id}-${row.team_id}`}><td><strong>{row.player_name || row.player_id}</strong><small>Player {row.player_id}</small></td><td>{row.team_name || row.team_id}</td><td className="numeric">{row.games || "—"}</td><td className="numeric">{row.points == null || !row.games ? "—" : (row.points / row.games).toFixed(1)}</td><td className="numeric"><button className="button secondary" type="button" disabled={ids.includes(row.player_id) || ids.length >= 3} onClick={() => { const next = [...ids, row.player_id].slice(0, 3); setIds(next); setInput(next.join(", ")); }}> {ids.includes(row.player_id) ? "Added" : ids.length >= 3 ? "Full" : "Add"} </button></td></tr>)}</tbody></table></div>}<p className="note">Find IDs from the <Link href="/basketball/ncaa-rankings/">player rankings</Link>, player box archive or a source link. Search results are only a discovery aid; comparison requests still load and join records by exact player ID.</p></section>
    {error && <p className="status-error" role="alert">{error}</p>}
    {loading && <p className="empty" role="status">Loading source-native player cards…</p>}
    {!loading && !cards.length && <section className="paper-panel"><h2>Start with player IDs.</h2><p>Enter one to three numeric player IDs to compare their selected-season evidence side by side. A single ID is useful when you want a compact season summary before opening the full card.</p></section>}
    {!loading && missingIds.length > 0 && <p className="note" role="status">No retained {label(season)} player-season row matched archive ID{missingIds.length === 1 ? "" : "s"} {missingIds.join(", ")}. The other exact-ID records remain visible.</p>}
    {!loading && cards.length > 0 && <><div className="strip"><div><strong>{cards.length}</strong><span>Players compared</span></div><div><strong>{label(season)}</strong><span>Selected season</span></div><div><strong>{sourceReceipts.length}</strong><span>Shared edition receipts</span></div><div><strong>Exact ID</strong><span>Join method</span></div></div>{sourceReceipts.length > 0 && <details className="paper-panel" style={{ marginTop: 24 }}><summary><strong>Comparison edition receipts</strong> · same-season evidence shared by every column</summary><div className="table-scroll" style={{ marginTop: 14 }}><table className="data-table"><thead><tr><th>Dataset</th><th>Retrieved</th><th>SHA-256</th></tr></thead><tbody>{sourceReceipts.map((receipt) => <tr key={`${receipt.dataset}-${receipt.sha256}`}><td>{receipt.dataset.replace(/^ncaa_/, "player ")}</td><td>{receipt.fetched_at}</td><td><code>{receipt.sha256.slice(0, 16)}…</code></td></tr>)}</tbody></table></div><p className="note">{identityPolicy}</p></details>}<section className="section"><div className="section-heading"><div><div className="eyebrow">Side-by-side evidence</div><h2>Read the shape of the season.</h2></div><div className="button-row"><span className="note">Rows pooled by player ID and season</span><button className="button secondary" type="button" onClick={share}>Copy comparison link</button></div></div>{copied && <p role="status">{copied}</p>}<div className="two-col">{cards.map((card) => <PlayerColumn key={card.player_id} card={card} season={season} impact={impact.find((row) => row.season === season && row.player_id === card.player_id)} rankingRows={exactRankingContextRows(rankingRows, card.player_id)} />)}</div></section><p className="note">This comparison is descriptive evidence for scouting and study; it does not assert eligibility, current roster membership or identity beyond the selected player ID.</p></>}
  </>;
}
