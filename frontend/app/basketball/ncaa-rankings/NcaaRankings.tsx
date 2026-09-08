"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Metric = "ppg" | "rpg" | "apg" | "spg" | "bpg" | "ts" | "efg" | "per40" | "ast_to" | "stocks40" | "tov_rate" | "three_rate" | "three_pct" | "ft_rate" | "ast_rate" | "points_poss" | "orb40" | "drb40" | "reb40" | "poss_share" | "rapm_net" | "orapm" | "drapm" | "balanced_index" | "impact_index";
type Row = { season: number; player_id: string; team_id: string; player_name: string | null; team_name: string | null; position: string | null; class_year: string | null; games: number; minutes: number; points: number; rebounds: number; assists: number; steals: number; blocks: number; value: number; component_count?: number; ppg_value?: number | null; rpg_value?: number | null; apg_value?: number | null; spg_value?: number | null; bpg_value?: number | null; ts_value?: number | null; ts_denominator?: number | null; efg_value?: number | null; efg_denominator?: number | null; per40_value?: number | null; rank: number; rapm_net: number | null; orapm: number | null; drapm: number | null; off_poss: number | null; def_poss: number | null };
type Result = { season: number; metric: Metric; min_games: number; min_minutes: number; min_volume: number; page: number; page_size: number; total: number; rows: Row[] };
type Meta = { seasons: number[]; metrics: Metric[]; positions: string[]; classes: string[]; sources?: Array<{ dataset: string; fetched_at: string | null; sha256: string | null }> };
const labels: Record<Metric, string> = { ppg: "Points per game", rpg: "Rebounds per game", apg: "Assists per game", spg: "Steals per game", bpg: "Blocks per game", ts: "True shooting %", efg: "Effective FG %", per40: "Points per 40 minutes", ast_to: "Assist-to-turnover ratio", stocks40: "Stocks per 40 minutes", tov_rate: "Turnover rate", three_rate: "Three-point attempt rate", three_pct: "Three-point accuracy", ft_rate: "Free-throw attempt rate", ast_rate: "Assists per recorded possession", points_poss: "Points per recorded possession", orb40: "Offensive rebounds per 40", drb40: "Defensive rebounds per 40", reb40: "Rebounds per 40 minutes", poss_share: "Team possession share", rapm_net: "Net RAPM", orapm: "Offensive RAPM", drapm: "Defensive RAPM", balanced_index: "Balanced production index", impact_index: "Impact + production index" };
const label = (season: number) => `${season - 1}–${String(season).slice(-2)}`;
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);
const percentile = (rank: number, total: number) => total <= 1 ? 100 : Math.max(0, Math.min(100, 100 * (total - rank) / (total - 1)));
const metricFromQuery = (value: string | null): Metric => value && Object.prototype.hasOwnProperty.call(labels, value) ? value as Metric : "ppg";
const sourceDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "date unavailable";

export default function NcaaRankings() {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [season, setSeason] = useState(initial?.get("season") || "2026");
  const [metric, setMetric] = useState<Metric>(metricFromQuery(initial?.get("metric") || null));
  const [minGames, setMinGames] = useState(initial?.get("minGames") || "5");
  const [minMinutes, setMinMinutes] = useState(initial?.get("minMinutes") || "200");
  const [minVolume, setMinVolume] = useState(initial?.get("minVolume") || "0");
  const [query, setQuery] = useState(initial?.get("q") || "");
  const [position, setPosition] = useState(initial?.get("position") || "");
  const [classYear, setClassYear] = useState(initial?.get("classYear") || "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(() => {
    const value = Number(initial?.get("page") || 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ season, metric, minGames, minMinutes, minVolume });
    if (query.trim()) params.set("q", query.trim());
    if (position) params.set("position", position);
    if (classYear) params.set("classYear", classYear);
    if (page) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [season, metric, minGames, minMinutes, minVolume, query, position, classYear, page]);

  useEffect(() => {
    fetch(`/api/basketball/research/ncaa-player-rankings?meta=1&season=${season}`)
      .then((r) => { if (!r.ok) throw Error("The NCAA ranking catalog could not be loaded."); return r.json() as Promise<Meta>; })
      .then(setMeta).catch((e) => setError(e.message));
  }, [season]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ season, metric, minGames, minMinutes, minVolume, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (position) params.set("position", position);
    if (classYear) params.set("classYear", classYear);
    setResult(null);
    fetch(`/api/basketball/research/ncaa-player-rankings?${params}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw Error("The NCAA rankings could not be loaded."); return r.json() as Promise<Result>; })
      .then((value) => { if (!controller.signal.aborted) setResult(value); })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [season, metric, minGames, minMinutes, minVolume, query, position, classYear, page]);

  const pages = useMemo(() => Math.max(1, Math.ceil((result?.total || 0) / 50)), [result]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Ranking link copied.");
    } catch {
      setCopied("Copy the ranking URL from your address bar.");
    }
  };
  const download = () => {
    if (!result) return;
    downloadCsv(
      `ncaa-player-rankings-${season}-${metric}-page-${page + 1}.csv`,
      toCsv(
        ["Season", "Metric", "Rank", "Percentile", "Player", "NCAA player ID", "Program", "NCAA team ID", "Position", "Class", "Games", "Minutes", "Points", "Rebounds", "Assists", "Steals", "Blocks", "Value", "Balanced components available", "Balanced PPG", "Balanced RPG", "Balanced APG", "Balanced SPG", "Balanced BPG", "Balanced TS %", "Balanced TS denominator", "Balanced eFG %", "Balanced eFG denominator", "Balanced P40", "Impact RAPM net", "Impact P40", "Impact ORAPM", "Impact DRAPM", "Impact offensive possessions", "Impact defensive possessions"],
        result.rows.map((row) => [result.season, labels[result.metric], row.rank, percentile(row.rank, result.total).toFixed(1), row.player_name, row.player_id, row.team_name, row.team_id, row.position, row.class_year, row.games, row.minutes, row.points, row.rebounds, row.assists, row.steals, row.blocks, row.value, row.component_count == null ? null : `${row.component_count}/8`, row.ppg_value, row.rpg_value, row.apg_value, row.spg_value, row.bpg_value, row.ts_value, row.ts_denominator, row.efg_value, row.efg_denominator, row.per40_value, row.rapm_net, row.per40_value, row.orapm, row.drapm, row.off_poss, row.def_poss]),
      ),
    );
  };
  return <>
    <div className="page-title">
      <div className="eyebrow">NCAA source archive / player rankings</div>
      <h1>Find the next<br /><em>difference maker.</em></h1>
      <p>Rank NCAA-derived production and exact-ID impact with a coach&apos;s minimum sample. Every board shows the source identity, workload and the metric used to order the list.</p>
    </div>
    <div className="strip">
      <div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Qualified player/team rows</span></div>
      <div><strong>{result?.min_games ?? minGames}</strong><span>Minimum games</span></div>
      <div><strong>{result?.min_minutes ?? minMinutes}</strong><span>Minimum minutes</span></div>
      <div><strong>{meta?.seasons.length ?? "—"}</strong><span>Source seasons</span></div>
      <div><strong>NCAA</strong><span>Identity namespace</span></div>
    </div>
    <div className="toolbar">
      <label className="control"><span>SEASON</span><select value={season} onChange={(e) => reset(() => setSeason(e.target.value))}>{(meta?.seasons || [2026]).map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      <label className="control"><span>RANK BY</span><select value={metric} onChange={(e) => reset(() => setMetric(e.target.value as Metric))}>{(meta?.metrics || ["ppg", "rpg", "apg", "spg", "bpg", "ts", "efg", "per40", "ast_to", "stocks40", "tov_rate", "three_rate", "three_pct", "ft_rate", "ast_rate", "points_poss", "orb40", "drb40", "reb40", "poss_share", "rapm_net", "orapm", "drapm", "balanced_index", "impact_index"]).map((m) => <option key={m} value={m}>{labels[m]}</option>)}</select></label>
      <label className="control"><span>MINIMUM GAMES</span><select value={minGames} onChange={(e) => reset(() => setMinGames(e.target.value))}>{[1, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} games</option>)}</select></label>
      <label className="control"><span>MINIMUM MINUTES</span><select value={minMinutes} onChange={(e) => reset(() => setMinMinutes(e.target.value))}>{[0, 200, 400, 600, 800].map((n) => <option key={n} value={n}>{n ? `${n} minutes` : "No minute minimum"}</option>)}</select></label>
      <label className="control"><span>MINIMUM RATE SAMPLE</span><select value={minVolume} onChange={(e) => reset(() => setMinVolume(e.target.value))}>{[0, 25, 50, 100, 200, 400].map((n) => <option key={n} value={n}>{n ? `${n} denominator units` : "No rate minimum"}</option>)}</select></label>
      <label className="control"><span>PLAYER OR TEAM</span><input type="search" maxLength={120} placeholder="Search a player or team" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
      <label className="control"><span>POSITION</span><select value={position} onChange={(e) => reset(() => setPosition(e.target.value))}><option value="">All positions</option>{position && !meta?.positions.includes(position) && <option value={position}>{position} · not in sample</option>}{(meta?.positions || []).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="control"><span>CLASS</span><select value={classYear} onChange={(e) => reset(() => setClassYear(e.target.value))}><option value="">All classes</option>{classYear && !meta?.classes.includes(classYear) && <option value={classYear}>{classYear} · not in sample</option>}{(meta?.classes || []).map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    {meta?.sources?.length ? <p className="note" style={{ marginTop: 16 }}>Source receipts for {label(Number(season))}: {meta.sources.map((source) => `${source.dataset.replace(/^ncaa_/, "NCAA ")} · ${sourceDate(source.fetched_at)}`).join(" · ")}. These timestamps describe the retained release, not live roster status.</p> : null}
    {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading NCAA rankings…</p> : <>
      <div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} qualified player/team rows · ranked by {labels[result.metric].toLowerCase()} · minimum {result.min_games} games and {result.min_minutes} recorded minutes{result.min_volume ? ` · ${result.min_volume} denominator units on rate boards` : ""}. Percentile is calculated against this full qualified cohort, so it remains meaningful when you move between pages.</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={share}>Copy ranking link</button></div></div>
      {(result.metric === "rapm_net" || result.metric === "orapm" || result.metric === "drapm") && <p className="note">{labels[result.metric]} is the publisher&apos;s lineup estimate and is shown only when the exact NCAA player ID has at least 500 offensive and 500 defensive possessions. The controls above additionally require the selected box-score games and minutes.</p>}
      {(result.metric === "ast_to" || result.metric === "stocks40") && <p className="note">{result.metric === "ast_to" ? "Assist-to-turnover ratio uses recorded assists divided by recorded turnovers; zero-turnover rows remain unavailable." : "Stocks per 40 combines recorded steals and blocks and scales them to 40 minutes; it is a descriptive defensive-event rate."} It is a source-stat rate, not a forecast input.</p>}
      {(result.metric === "tov_rate" || result.metric === "three_rate" || result.metric === "three_pct" || result.metric === "ft_rate" || result.metric === "ast_rate" || result.metric === "points_poss") && <p className="note">{result.metric === "tov_rate" ? "Turnover rate is recorded turnovers divided by recorded offensive possessions." : result.metric === "three_rate" ? "Three-point attempt rate is recorded three-point attempts divided by field-goal attempts." : result.metric === "three_pct" ? "Three-point accuracy is recorded makes divided by recorded three-point attempts." : result.metric === "ft_rate" ? "Free-throw attempt rate is recorded free-throw attempts divided by field-goal attempts." : result.metric === "ast_rate" ? "Assist rate here is recorded assists divided by recorded offensive possessions." : "Points per recorded possession divides source points by recorded offensive possessions."} Values remain unavailable when the source denominator is missing. The minimum rate sample control uses the matching denominator where applicable. These are descriptive source rates, not forecast inputs.</p>}
      {result.metric === "ast_to" && <p className="note">The minimum rate sample control uses recorded turnovers for this board; zero-turnover rows remain unavailable. Assist-to-turnover ratio is a source-stat rate, not a forecast input.</p>}
      {result.metric === "poss_share" && <p className="note">Team possession share is the player&apos;s recorded offensive possessions divided by the sum of recorded player offensive possessions for that NCAA team-season. It describes source-recorded workload and is unavailable when the team denominator is missing; it is not a usage or role projection.</p>}
      {result.metric === "balanced_index" && <p className="note">Balanced production index is a descriptive cohort score: available points, rebounds, assists, steals, blocks, true shooting, effective FG and points per 40 are standardized within this filtered board and averaged. The component audit uses games for PPG/RPG/APG/SPG/BPG, FGA + 0.475 × FTA for TS%, FGA for eFG% and minutes for P40; at least four of eight components are required. It is a shortlist aid, not an eligibility grade or forecast input.</p>}
      {result.metric === "impact_index" && <p className="note">Impact + production index averages standardized exact-ID net RAPM and points per 40 within this filtered board. Both sources are required: RAPM must have at least 500 offensive and 500 defensive possessions, and P40 uses minutes as its denominator. It is a research shortlist, not a player value claim, recruiting grade or forecast input.</p>}
      {copied && <p role="status">{copied}</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th className="numeric">Percentile</th><th>Player</th><th>Program</th><th>Position</th><th>Class</th><th className="numeric">GP</th><th className="numeric">MIN</th><th className="numeric">PTS</th><th className="numeric">REB</th><th className="numeric">AST</th><th className="numeric">{labels[result.metric]}</th>{result.metric === "balanced_index" && <th className="numeric">Components / audit</th>}{(result.metric === "rapm_net" || result.metric === "orapm" || result.metric === "drapm" || result.metric === "impact_index") && <><th className="numeric">P40</th><th className="numeric">Net RAPM</th><th className="numeric">ORAPM</th><th className="numeric">DRAPM</th><th className="numeric">Poss.</th></>}</tr></thead><tbody>{result.rows.map((row) => <tr key={`${row.player_id}-${row.team_id}`}><td className="numeric"><strong>#{row.rank}</strong></td><td className="numeric">{percentile(row.rank, result.total).toFixed(1)}%</td><td><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${row.season}`}>{row.player_name || row.player_id} →</Link><small>NCAA player {row.player_id}</small><small><a href={`https://stats.ncaa.org/players/${encodeURIComponent(row.player_id)}`} target="_blank" rel="noreferrer">NCAA source ↗</a> · <Link href={`/basketball/recruiting/?q=${encodeURIComponent(row.player_name || row.player_id)}`}>Search dated evidence →</Link></small></td><td><strong>{row.team_name || row.team_id}</strong><small>NCAA team {row.team_id} · <a href={`https://stats.ncaa.org/teams/${encodeURIComponent(row.team_id)}`} target="_blank" rel="noreferrer">source ↗</a></small></td><td>{row.position || "—"}</td><td>{row.class_year || "—"}</td><td className="numeric">{fmt(row.games, 0)}</td><td className="numeric">{fmt(row.minutes, 0)}</td><td className="numeric">{fmt(row.points, 0)}</td><td className="numeric">{fmt(row.rebounds, 0)}</td><td className="numeric">{fmt(row.assists, 0)}</td><td className="numeric"><strong>{fmt(row.value, ["ts", "efg", "tov_rate", "three_rate", "three_pct", "ft_rate", "ast_rate", "poss_share"].includes(result.metric) ? 1 : 2)}{["ts", "efg", "tov_rate", "three_rate", "three_pct", "ft_rate", "ast_rate", "poss_share"].includes(result.metric) ? "%" : ""}</strong></td>{result.metric === "balanced_index" && <td className="numeric"><details><summary>{row.component_count ?? "—"} / 8</summary><small>PPG {fmt(row.ppg_value, 2)} · RPG {fmt(row.rpg_value, 2)} · APG {fmt(row.apg_value, 2)} · SPG {fmt(row.spg_value, 2)} · BPG {fmt(row.bpg_value, 2)}</small><small>TS {fmt(row.ts_value, 1)}% ({fmt(row.ts_denominator, 1)} attempts) · eFG {fmt(row.efg_value, 1)}% ({fmt(row.efg_denominator, 0)} FGA) · P40 {fmt(row.per40_value, 2)} ({fmt(row.minutes, 0)} min)</small></details></td>}{(result.metric === "rapm_net" || result.metric === "orapm" || result.metric === "drapm" || result.metric === "impact_index") && <><td className="numeric">{fmt(row.per40_value, 2)}</td><td className="numeric">{fmt(row.rapm_net, 2)}</td><td className="numeric">{fmt(row.orapm, 2)}</td><td className="numeric">{fmt(row.drapm, 2)}</td><td className="numeric">{fmt(row.off_poss, 0)} / {fmt(row.def_poss, 0)}</td></>}</tr>)}</tbody></table></div>
      {!result.rows.length && <p className="empty">No players match this ranking filter.</p>}
      <div className="pagination"><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={(page + 1) * 50 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div>
      <p className="note" style={{ marginTop: 24 }}>Source: NCAA-derived player box release and NCAA lineup RAPM via SportsDataverse. Net RAPM is available only where the exact NCAA player ID appears in both releases; no name-only identity join is used. Rankings are descriptive source statistics, not eligibility, recruiting grades or an ESPN identity match.</p>
    </>}
  </>;
}
