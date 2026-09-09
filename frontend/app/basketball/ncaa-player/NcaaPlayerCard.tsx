"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { date, fmt } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { buildNcaaRecentForm } from "../../_lib/ncaa-player-form";
import { effectiveFieldGoal, safeRate, safeSum, trueShooting } from "../../_lib/ncaa-player-box";
import PlayerRankingSnapshot from "./PlayerRankingSnapshot";
import {
  buildNcaaPlayerTrajectory,
  type TrajectorySeason,
} from "../../_lib/ncaa-player-trajectory";

type Stats = Record<string, number | null>;
type SeasonRow = { season: number; team_id: string; team_name: string | null; player_name: string | null; games: number; stats: Stats };
type RosterRow = { season: number; team_id: string; team_name: string | null; player_name: string | null; profile: Record<string, string | number | null> };
type ShotRow = { season: number; team_id: string; team_name: string | null; stats: { attempts: number; makes: number; points: number; distance_sum: number; distance_count: number; zones: Record<string, { attempts: number; makes: number; points: number }> } };
type GameRow = { contest_id: string; team_id: string; game_date: string | null; team_name: string | null; opponent_name: string | null; player_name: string | null; stats: Stats };
type GameExport = { season: number; page: number; page_size: number; total: number; rows: GameRow[] };
type Card = { player_id: string; selected_season: number; seasons: SeasonRow[]; rosters: RosterRow[]; shooting: ShotRow[]; games: GameRow[]; source_receipts?: Array<{ dataset: string; season: number; url: string; fetched_at: string; sha256: string }>; identity_note: string };
type Impact = { season: number; player_id: string; player: string; team: string; orapm: number | null; drapm: number | null; rapm_net: number | null; off_poss: number | null; def_poss: number | null; qualified: boolean; rank: number | null };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const value = (stats: Stats | undefined, key: string) => stats?.[key] == null ? null : Number(stats[key]);
const rate = safeRate;
const pct = (v: number | null) => v == null ? "—" : `${fmt(v * 100, 1)}%`;
const stat = (row: SeasonRow | undefined, key: string) => value(row?.stats, key);

export default function NcaaPlayerCard() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const [season, setSeason] = useState(Number(params.get("season")) || 2026);
  const [card, setCard] = useState<Card | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [allGames, setAllGames] = useState<GameRow[] | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setCard(null); setImpact(null); setError(""); setAllGames(null); setLoadingGames(false);
    Promise.all([
      fetch(`/api/basketball/research/ncaa-player-card/${encodeURIComponent(id)}?season=${season}`, { signal: controller.signal }).then(async (r) => { if (!r.ok) throw Error(r.status === 404 ? "No NCAA source record was found for that player ID." : "The NCAA player card could not be loaded."); return r.json() as Promise<Card>; }),
      fetch("/data/basketball/impact.json", { signal: controller.signal }).then((r) => r.ok ? r.json() as Promise<{ players: Impact[] }> : { players: [] }).catch(() => ({ players: [] })),
    ]).then(([next, release]) => { if (!controller.signal.aborted) { setCard(next); setImpact(release.players.find((row) => row.season === season && row.player_id === id) || null); } }).catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [id, season]);
  useEffect(() => { if (!id) return; const url = new URL(window.location.href); url.searchParams.set("season", String(season)); window.history.replaceState(null, "", url); }, [id, season]);
  const selected = useMemo(() => card?.seasons.filter((row) => row.season === season), [card, season]);
  const selectedRow = selected?.[0];
  const roster = card?.rosters.find((row) => row.season === season);
  const shooting = card?.shooting.find((row) => row.season === season);
  const shotZones = shooting?.stats.zones || {};
  const recentForm = useMemo(() => buildNcaaRecentForm(card?.games || [], 5), [card?.games]);
  const trajectory = useMemo(
    () => buildNcaaPlayerTrajectory(card?.seasons || []),
    [card?.seasons],
  );
  const name = selectedRow?.player_name || roster?.player_name || card?.seasons[0]?.player_name || `NCAA player ${id}`;
  const team = selectedRow?.team_name || roster?.team_name || card?.seasons[0]?.team_name || "Source team unavailable";
  const points = stat(selectedRow, "pts"), games = selectedRow?.games || 0, minutes = stat(selectedRow, "mins"), fga = stat(selectedRow, "fga"), fgm = stat(selectedRow, "fgm"), fta = stat(selectedRow, "fta"), ast = stat(selectedRow, "ast"), orb = stat(selectedRow, "orb"), drb = stat(selectedRow, "drb");
  const ts = trueShooting({ pts: points, fga, fta });
  const efg = effectiveFieldGoal(fgm, stat(selectedRow, "tpm"), fga);
  const fetchFullGameLog = async () => {
    if (!id || loadingGames || allGames) return allGames;
    setLoadingGames(true);
    try {
      const response = await fetch(`/api/basketball/research/ncaa-player-card/${encodeURIComponent(id)}/games?season=${season}&limit=500`);
      if (!response.ok) throw new Error("The complete NCAA game log could not be loaded.");
      const payload = await response.json() as GameExport;
      setAllGames(payload.rows);
      return payload.rows;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The complete NCAA game log could not be loaded.");
      return null;
    } finally {
      setLoadingGames(false);
    }
  };
  const downloadFullGameLog = async () => {
    if (!id || exporting) return;
    setExporting(true);
    try {
      const rows = await fetchFullGameLog();
      if (!rows) return;
      const statKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row.stats)))).sort();
      downloadCsv(
        `ncaa-player-${id}-${season}-complete-game-log.csv`,
        toCsv(
          ["Season", "Game date", "Contest ID", "Player", "NCAA player ID", "NCAA player source URL", "Team", "NCAA team ID", "Opponent", "NCAA contest source URL", ...statKeys, "Raw source stats JSON"],
          rows.map((row) => [
            season, row.game_date, row.contest_id, row.player_name, id, `https://stats.ncaa.org/players/${encodeURIComponent(id)}`, row.team_name, row.team_id, row.opponent_name, `https://stats.ncaa.org/game/index/${encodeURIComponent(row.contest_id)}`,
            ...statKeys.map((key) => row.stats[key]), JSON.stringify(row.stats),
          ]),
        ),
      );
    } finally {
      setExporting(false);
    }
  };
  const visibleGames = allGames || card?.games || [];
  if (!id) return <><div className="page-title"><div className="eyebrow">NCAA source identity / Player card</div><h1>Open a player&apos;s<br /><em>full file.</em></h1><p>Select a player from an NCAA archive table to see production, shot profile, roster context and game evidence in one source-native view.</p><Link className="button" href="/basketball/ncaa-rankings/">Find an NCAA player ↗</Link></div></>;
  return <>
    <Link className="eyebrow" href="/basketball/ncaa-rankings/">← NCAA player rankings</Link>
    <div className="page-title"><div className="eyebrow">NCAA player card / source ID {id}</div><h1>{name}</h1><p>{team} · {label(season)}. This card keeps the NCAA identity namespace intact while bringing production, shot selection, roster fields and impact evidence together. It does not assert current eligibility or join the record to ESPN by name.</p><div className="hero-actions"><a className="hero-link" href={`https://stats.ncaa.org/players/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Open NCAA source ↗</a><Link className="hero-link" href={`/basketball/ncaa-player-box/?season=${season}&q=${encodeURIComponent(id)}`}>Open box archive rows →</Link><Link className="hero-link" href={`/basketball/players/?q=${encodeURIComponent(name)}`}>Search ESPN-derived archive →</Link><Link className="hero-link" href={`/basketball/source-stats/?q=${encodeURIComponent(name)}`}>Search publisher stat fields →</Link></div></div>
    {error ? <p className="status-error" role="alert">{error}</p> : !card ? <p className="empty" role="status">Loading source-native player evidence…</p> : <>
      <div className="strip"><div><strong>{card.seasons.length}</strong><span>Season-team records</span></div><div><strong>{games || "—"}</strong><span>{label(season)} games</span></div><div><strong>{points == null || !games ? "—" : fmt(points / games)}</strong><span>Points per game</span></div><div><strong>{pct(ts)}</strong><span>Estimated TS%</span></div></div>
      <div className="toolbar"><label className="control"><span>STAT SEASON</span><select value={season} onChange={(e) => setSeason(Number(e.target.value))}>{Array.from(new Set(card.seasons.map((row) => row.season))).sort((a, b) => b - a).map((year) => <option value={year} key={year}>{label(year)}</option>)}</select></label><span className="note">{card.identity_note}</span></div>
      {card.source_receipts?.length ? <details className="paper-panel" style={{ marginBottom: 24 }}><summary><strong>Source receipts for the {label(season)} evidence</strong> · {card.source_receipts.length} release{card.source_receipts.length === 1 ? "" : "s"}</summary><div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Dataset</th><th>Retrieved</th><th>SHA-256</th><th>Release</th></tr></thead><tbody>{card.source_receipts.map((receipt) => <tr key={`${receipt.dataset}-${receipt.season}`}><td>{receipt.dataset.replace(/^ncaa_/, "NCAA ")}</td><td>{date(receipt.fetched_at)}</td><td className="mono">{receipt.sha256.slice(0, 16)}…</td><td><a href={receipt.url} target="_blank" rel="noreferrer">Open release ↗</a></td></tr>)}</tbody></table></div></details> : null}
      <PlayerRankingSnapshot id={id} season={season} />
      <PlayerTrajectory rows={trajectory} selectedSeason={season} />
      <section className="section"><div className="section-heading"><div><div className="eyebrow">Selected season / Production</div><h2>What the source recorded.</h2></div><span className="note">{selected?.length || 0} team record{selected?.length === 1 ? "" : "s"}</span></div><div className="strip"><div><strong>{fmt(minutes == null || !games ? null : minutes / games)}</strong><span>Minutes per game</span></div><div><strong>{fmt(safeSum(orb, drb) == null || !games ? null : safeSum(orb, drb)! / games)}</strong><span>Rebounds per game</span></div><div><strong>{fmt(ast == null || !games ? null : ast / games)}</strong><span>Assists per game</span></div><div><strong>{pct(efg)}</strong><span>Effective FG%</span></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Season / team</th><th className="numeric">GP</th><th className="numeric">PTS</th><th className="numeric">REB</th><th className="numeric">AST</th><th className="numeric">FG</th><th className="numeric">3P</th><th className="numeric">FT</th></tr></thead><tbody>{card.seasons.map((row) => <tr key={`${row.season}-${row.team_id}`} className={row.season === season ? "career-selected-row" : ""}><td><button className="career-season-link" onClick={() => setSeason(row.season)}>{label(row.season)} · {row.team_name || row.team_id} →</button><small>NCAA team {row.team_id}</small></td><td className="numeric">{row.games}</td><td className="numeric">{fmt(value(row.stats, "pts"), 0)}</td><td className="numeric">{fmt(safeSum(value(row.stats, "orb"), value(row.stats, "drb")), 0)}</td><td className="numeric">{fmt(value(row.stats, "ast"), 0)}</td><td className="numeric">{fmt(value(row.stats, "fgm"), 0)}/{fmt(value(row.stats, "fga"), 0)}</td><td className="numeric">{fmt(value(row.stats, "tpm"), 0)}/{fmt(value(row.stats, "tpa"), 0)}</td><td className="numeric">{fmt(value(row.stats, "ftm"), 0)}/{fmt(value(row.stats, "fta"), 0)}</td></tr>)}</tbody></table></div></section>
      <section className="section"><div className="section-heading"><div><div className="eyebrow">Recent form / latest retained contests</div><h2>Read the current rhythm.</h2></div><span className="note">{recentForm.window_games ? `Latest ${recentForm.window_games} of up to 12 rows` : "No recent rows"}</span></div><p className="note">This is a short source-row window, ordered newest first by the NCAA archive. It is descriptive context for film and preparation, not a projection. Each metric uses only contests where its required fields were recorded; missing values are not treated as zero.</p><div className="strip"><div><strong>{fmt(recentForm.points_per_game)}</strong><span>Recent points / game · {recentForm.points_games} rows</span></div><div><strong>{fmt(recentForm.minutes_per_game)}</strong><span>Recent minutes / game · {recentForm.minutes_games} rows</span></div><div><strong>{pct(recentForm.true_shooting)}</strong><span>Recent pooled TS% · {recentForm.shooting_games} rows</span></div><div><strong>{recentForm.points_delta == null ? "—" : `${recentForm.points_delta > 0 ? "+" : ""}${fmt(recentForm.points_delta)}`}</strong><span>Points / game vs prior five</span></div></div><p className="note">The comparison uses the next five retained rows when available. A blank comparison means the preceding window has no complete points sample.</p></section>
      <section className="section two-col"><div className="paper-panel"><div className="eyebrow">Shot profile / {label(season)}</div><h2>Where attempts came from.</h2>{shooting ? <><div className="strip"><div><strong>{shooting.stats.attempts.toLocaleString()}</strong><span>Recorded attempts</span></div><div><strong>{pct(rate(shooting.stats.makes, shooting.stats.attempts))}</strong><span>Field-goal rate</span></div><div><strong>{shooting.stats.distance_count ? `${(shooting.stats.distance_sum / shooting.stats.distance_count).toFixed(1)} ft` : "—"}</strong><span>Average distance</span></div></div><div className="metric-bars">{["rim", "mid", "corner3", "abovebreak3"].map((key) => { const zone = shotZones[key]; const share = shooting.stats.attempts ? (zone?.attempts || 0) / shooting.stats.attempts : 0; return <div className="metric-bar" key={key}><span>{key === "abovebreak3" ? "Above-break 3" : key === "corner3" ? "Corner 3" : key === "rim" ? "Rim" : "Midrange"}</span><span className="career-bar-track"><span style={{ width: `${share * 100}%` }} /></span><strong>{zone?.attempts?.toLocaleString() || "—"} · {pct(rate(zone?.makes || null, zone?.attempts || null))}</strong></div>; })}</div></> : <p className="empty">No shooting profile is published for this season-team record.</p>}</div><div className="paper-panel"><div className="eyebrow">Roster / recruiting context</div><h2>What the roster release says.</h2>{roster ? <><div className="raw-stat-grid">{[["Class", roster.profile.class], ["Position", roster.profile.position], ["Height", roster.profile.height], ["Hometown", roster.profile.hometown], ["High school", roster.profile.high_school]].map(([key, field]) => <div key={key}><dt>{key}</dt><dd>{field || "—"}</dd></div>)}</div><div className="hero-actions"><Link className="button secondary" href={`/basketball/recruiting/?q=${encodeURIComponent(name)}`}>Search dated school evidence ↗</Link>{roster.profile.high_school && <Link className="hero-link" href={`/basketball/ncaa-high-schools/?q=${encodeURIComponent(String(roster.profile.high_school))}`}>Trace high-school pipeline →</Link>}</div><p className="note">These links are text searches for review. A name or school-label match does not establish identity, commitment, transfer, eligibility or current membership.</p></> : <p className="empty">No roster row is published for {label(season)}.</p>}</div></section>
      <section className="section"><div className="section-heading"><div><div className="eyebrow">Impact / source model</div><h2>Read the player in context.</h2></div></div>{impact ? <div className="strip"><div><strong>{fmt(impact.rapm_net, 2)}</strong><span>Net RAPM</span></div><div><strong>{fmt(impact.orapm, 2)}</strong><span>ORAPM</span></div><div><strong>{fmt(impact.drapm, 2)}</strong><span>DRAPM</span></div><div><strong>{impact.rank ? `#${impact.rank}` : "—"}</strong><span>{impact.qualified ? "Qualified league rank" : "Unqualified sample"}</span></div></div> : <p className="empty">No league-wide RAPM row matches this NCAA ID and season. Open the <Link href="/basketball/impact/">full impact archive</Link> for the broader source board.</p>}</section>
      <section className="section"><div className="section-heading"><div><div className="eyebrow">Game evidence / {label(season)}</div><h2>Open the possessions behind the total.</h2></div><div className="button-row"><span className="note">{allGames ? `${visibleGames.length} source rows loaded` : "Latest 12 source rows"}</span>{allGames ? <button className="button secondary" type="button" onClick={() => setAllGames(null)}>Show latest 12</button> : <button className="button secondary" type="button" onClick={() => { void fetchFullGameLog(); }} disabled={loadingGames || !card.games.length}>{loadingGames ? "Loading log…" : "Show complete log"}</button>}<button className="button secondary" type="button" onClick={downloadFullGameLog} disabled={exporting || loadingGames || !card.games.length}>{exporting ? "Preparing log…" : "Download full season CSV ↓"}</button></div></div><p className="note">The card starts with the latest 12 rows for a fast load. Show complete log loads every retained contest for this NCAA player ID and season; the download includes all source fields, including fields not displayed in the table.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Date / opponent</th><th className="numeric">MIN</th><th className="numeric">PTS</th><th className="numeric">REB</th><th className="numeric">AST</th><th className="numeric">FG</th><th className="numeric">3P</th></tr></thead><tbody>{visibleGames.map((game) => <tr key={game.contest_id}><td>{game.game_date || "Date unavailable"}<small>{game.team_name || team} vs {game.opponent_name || "Opponent unavailable"} · contest {game.contest_id}</small><small><a href={`https://stats.ncaa.org/game/index/${encodeURIComponent(game.contest_id)}`} target="_blank" rel="noreferrer">NCAA source ↗</a></small></td><td className="numeric">{fmt(value(game.stats, "mins"), 0)}</td><td className="numeric">{fmt(value(game.stats, "pts"), 0)}</td><td className="numeric">{fmt(safeSum(value(game.stats, "orb"), value(game.stats, "drb")), 0)}</td><td className="numeric">{fmt(value(game.stats, "ast"), 0)}</td><td className="numeric">{fmt(value(game.stats, "fgm"), 0)}/{fmt(value(game.stats, "fga"), 0)}</td><td className="numeric">{fmt(value(game.stats, "tpm"), 0)}/{fmt(value(game.stats, "tpa"), 0)}</td></tr>)}</tbody></table></div>{!visibleGames.length && <p className="empty">No game-level rows are published for this season; use the season summary above.</p>}</section>
      <section className="section paper-panel"><h2>Use the card with the source caveat.</h2><p>Every table on this page stays within the NCAA source ID namespace. The same numeric ID is the only join used here. A missing row means this release does not contain that evidence; it does not mean the player was absent, ineligible or transferred. For ESPN-linked history, open the separate player file from the player index.</p></section>
    </>}
  </>;
}

const trajectoryValue = (value: number | null, digits = 1) =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

function PlayerTrajectory({
  rows,
  selectedSeason,
}: {
  rows: TrajectorySeason[];
  selectedSeason: number;
}) {
  const latest = rows[0];
  const prior = latest
    ? rows.find((row) => row.season < latest.season)
    : undefined;
  const ppgDelta =
    latest?.ppg != null && prior?.ppg != null ? latest.ppg - prior.ppg : null;
  const maxPpg = Math.max(...rows.map((row) => row.ppg || 0), 1);
  return (
    <section className="section paper-panel" aria-label="Player season trajectory">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Development / exact NCAA source ID</div>
          <h2>See the season move.</h2>
        </div>
        <span className="note">{rows.length} seasons with source rows</span>
      </div>
      <p className="note">
        Team rows are combined within each season for this same NCAA player ID.
        Rates use pooled source totals, and a missing required field stays
        unavailable. This is a descriptive development view, not an identity
        claim about a different player with the same name.
      </p>
      {latest && (
        <div className="strip" style={{ marginTop: 18 }}>
          <div>
            <strong>{trajectoryValue(latest.ppg)}</strong>
            <span>Latest points / game</span>
          </div>
          <div>
            <strong>
              {ppgDelta == null
                ? "—"
                : (ppgDelta >= 0 ? "+" : "") + trajectoryValue(ppgDelta)}
            </strong>
            <span>Change vs prior source season</span>
          </div>
          <div>
            <strong>{trajectoryValue(latest.mpg)}</strong>
            <span>Latest minutes / game</span>
          </div>
          <div>
            <strong>{trajectoryValue(latest.ts == null ? null : latest.ts * 100)}%</strong>
            <span>Latest pooled TS%</span>
          </div>
        </div>
      )}
      <div className="trajectory-list" style={{ marginTop: 22 }}>
        {rows.map((row) => (
          <div
            className={
              "trajectory-row" +
              (row.season === selectedSeason ? " is-selected" : "")
            }
            key={row.season}
          >
            <div className="trajectory-label">
              <strong>{label(row.season)}</strong>
              <small>
                {row.teams} team{row.teams === 1 ? "" : "s"} · {row.games || "—"} games
              </small>
            </div>
            <div
              className="trajectory-track"
              aria-label={label(row.season) + " points per game"}
            >
              <span
                className="trajectory-bar"
                style={{
                  width:
                    (row.ppg == null
                      ? 0
                      : Math.min(100, (row.ppg / maxPpg) * 100)) + "%",
                }}
              />
            </div>
            <div className="trajectory-stats">
              <strong>{trajectoryValue(row.ppg)} PPG</strong>
              <span>
                {trajectoryValue(row.mpg)} MPG ·{" "}
                {trajectoryValue(row.ts == null ? null : row.ts * 100)}% TS
              </span>
            </div>
          </div>
        ))}
      </div>
      {!rows.length && <p className="empty">No season rows are available for this source ID.</p>}
    </section>
  );
}
