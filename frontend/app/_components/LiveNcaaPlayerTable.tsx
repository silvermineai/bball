"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../_lib/format";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";
import { fetchWithTransientRetry } from "../_lib/live-basketball-forecasts";

export type LiveNCAAMetric = "ppg" | "rpg" | "orpg" | "drpg" | "apg" | "spg" | "bpg" | "fpg" | "mpg" | "topg" | "dbl_dbl" | "ts" | "efg" | "half_ts" | "three_pct" | "two_pct" | "ft_pct" | "per40" | "ast_to" | "usage_rate" | "stocks40" | "tov_rate" | "three_rate" | "ft_rate" | "ast_rate" | "points_poss" | "poss_share" | "orb40" | "drb40" | "reb40" | "rim_pct" | "mid_pct" | "putback_pct" | "rim_rate" | "transition_share" | "unassisted_rate" | "unassisted_share" | "rapm_net" | "orapm" | "drapm" | "impact_index" | "balanced_index";
type Metric = LiveNCAAMetric;

export type LiveNCAAPlayerRow = {
  player_id: string;
  /** Exact NCAA team identity retained by the rankings endpoint. */
  team_id: string;
  player_name: string | null;
  team_name: string | null;
  position: string | null;
  class_year: string | null;
  games: number;
  minutes: number;
  points: number | null;
  rebounds: number | null;
  offensive_rebounds: number | null;
  defensive_rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  double_doubles: number | null;
  fouls: number | null;
  turnovers: number | null;
  fga: number | null;
  fgm: number | null;
  tpa: number | null;
  tpm: number | null;
  fta: number | null;
  ftm: number | null;
  /** Additional source fields retained by the player-season publisher. */
  possessions?: number | null;
  off_poss?: number | null;
  def_poss?: number | null;
  usage_events?: number | null;
  team_usage_events?: number | null;
  team_minutes?: number | null;
  team_possessions?: number | null;
  rim_attempts?: number | null;
  rim_makes?: number | null;
  mid_attempts?: number | null;
  mid_makes?: number | null;
  putback_attempts?: number | null;
  putback_makes?: number | null;
  transition_points?: number | null;
  unassisted_total_attempts?: number | null;
  unassisted_attempts?: number | null;
  unassisted_points?: number | null;
  half_points?: number | null;
  half_fga?: number | null;
  half_fta?: number | null;
  rapm_net?: number | null;
  orapm?: number | null;
  drapm?: number | null;
  value: number | null;
  rank: number;
};

type PlayerRow = LiveNCAAPlayerRow;

export type LiveNCAAPlayerRankingResult = {
  season?: number;
  metric?: Metric;
  total: number;
  page_size?: number;
  rows: PlayerRow[];
};
type Result = LiveNCAAPlayerRankingResult;

/** A ranked row must retain both sides of the exact player/team source key. */
export function hasExactPlayerSourceIdentity(value: unknown): value is Pick<LiveNCAAPlayerRow, "player_id" | "team_id"> {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.player_id === "string" && row.player_id.trim().length > 0
    && typeof row.team_id === "string" && row.team_id.trim().length > 0;
}

/**
 * Count only the core fields that the table can display without estimating a
 * missing value. This keeps a partial source row visibly distinct from a
 * complete stat line while preserving the raw values in the export.
 */
const coreStatFields = [
  "minutes", "points", "rebounds", "offensive_rebounds", "defensive_rebounds",
  "assists", "steals", "blocks", "fouls", "turnovers", "fga", "fgm", "tpa",
  "tpm", "fta", "ftm",
] as const;

export function playerCoreStatCoverage(row: LiveNCAAPlayerRow) {
  const observed = coreStatFields.filter((field) => {
    const value = row[field];
    return typeof value === "number" && Number.isFinite(value);
  }).length;
  return { observed, total: coreStatFields.length };
}

export type RecordedPlayerDetail = {
  label: string;
  value: number;
  percent?: boolean;
  decimals?: number;
};

export type RecordedPlayerDetailGroup = {
  key: string;
  label: string;
  items: RecordedPlayerDetail[];
};

const recordedNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const recordedPercent = (made: number | null | undefined, attempts: number | null | undefined): number | null =>
  recordedNumber(made) && recordedNumber(attempts) && attempts > 0 ? (100 * made) / attempts : null;

/**
 * Expose the richer publisher fields behind each ranked row. The ranking
 * table stays compact, while a reader can inspect the source-recorded shot,
 * possession and impact context for the same exact player ID. Missing fields
 * are omitted; no unavailable value is rendered as zero.
 */
export function playerRecordedDetailGroups(row: LiveNCAAPlayerRow): RecordedPlayerDetailGroup[] {
  const production: RecordedPlayerDetail[] = [];
  const add = (items: RecordedPlayerDetail[], label: string, value: number | null | undefined, options: Pick<RecordedPlayerDetail, "percent" | "decimals"> = {}) => {
    if (recordedNumber(value)) items.push({ label, value, ...options });
  };
  add(production, "Points", row.points);
  add(production, "Rebounds", row.rebounds);
  add(production, "Offensive rebounds", row.offensive_rebounds);
  add(production, "Defensive rebounds", row.defensive_rebounds);
  add(production, "Assists", row.assists);
  add(production, "Steals", row.steals);
  add(production, "Blocks", row.blocks);
  add(production, "Fouls", row.fouls);
  add(production, "Turnovers", row.turnovers);
  add(production, "Field goals made", row.fgm);
  add(production, "Field goals attempted", row.fga);
  add(production, "3-pointers made", row.tpm);
  add(production, "3-pointers attempted", row.tpa);
  add(production, "Free throws made", row.ftm);
  add(production, "Free throws attempted", row.fta);

  const shooting: RecordedPlayerDetail[] = [];
  const addSplit = (label: string, makes: number | null | undefined, attempts: number | null | undefined) => {
    add(shooting, `${label} attempts`, attempts);
    add(shooting, `${label} makes`, makes);
    add(shooting, `${label} accuracy`, recordedPercent(makes, attempts), { percent: true, decimals: 1 });
  };
  addSplit("Rim", row.rim_makes, row.rim_attempts);
  addSplit("Midrange", row.mid_makes, row.mid_attempts);
  addSplit("Putback", row.putback_makes, row.putback_attempts);
  add(shooting, "Transition points", row.transition_points);
  add(shooting, "Unassisted points", row.unassisted_points);
  add(shooting, "Unassisted attempts", row.unassisted_attempts ?? row.unassisted_total_attempts);
  add(shooting, "Half-court points", row.half_points);
  add(shooting, "Half-court FGA", row.half_fga);
  add(shooting, "Half-court FTA", row.half_fta);

  const context: RecordedPlayerDetail[] = [];
  add(context, "Offensive possessions", row.off_poss ?? row.possessions);
  add(context, "Defensive possessions", row.def_poss);
  add(context, "Usage events", row.usage_events);
  add(context, "Team usage events", row.team_usage_events);
  add(context, "Team minutes", row.team_minutes);
  add(context, "Team possessions", row.team_possessions);
  add(context, "Usage share", recordedPercent(row.usage_events, row.team_usage_events), { percent: true, decimals: 1 });
  add(context, "Possession share", recordedPercent(row.possessions ?? row.off_poss, row.team_possessions), { percent: true, decimals: 1 });
  add(context, "Net RAPM", row.rapm_net, { decimals: 2 });
  add(context, "Offensive RAPM", row.orapm, { decimals: 2 });
  add(context, "Defensive RAPM", row.drapm, { decimals: 2 });

  return [
    { key: "production", label: "Recorded production", items: production },
    { key: "shooting", label: "Shot and play context", items: shooting },
    { key: "impact", label: "Possession and impact context", items: context },
  ].filter((group) => group.items.length > 0);
}

export function validatePlayerExportPage(
  payload: LiveNCAAPlayerRankingResult,
  expectedTotal: number,
  expectedPageSize: number,
  page: number,
  totalPages: number,
) {
  const pageTotal = Number(payload.total);
  const pageSize = Number(payload.page_size || 50);
  if (!Number.isInteger(pageTotal) || pageTotal !== expectedTotal || !Number.isInteger(pageSize) || pageSize !== expectedPageSize || !Array.isArray(payload.rows) || payload.rows.length > pageSize) {
    throw new Error("The player archive changed during export.");
  }
  if (payload.rows.some((row) => !hasExactPlayerSourceIdentity(row))) {
    throw new Error("The player archive returned an incomplete source identity.");
  }
  if (page < totalPages - 1 && payload.rows.length === 0) {
    throw new Error("The player archive returned an incomplete page.");
  }
  return payload.rows;
}

const metrics: Array<{ key: Metric; label: string; description: string; volume: number }> = [
  { key: "ppg", label: "Scoring", description: "points per game", volume: 0 },
  { key: "rpg", label: "Rebounding", description: "rebounds per game", volume: 0 },
  { key: "orpg", label: "Offensive rebounding", description: "offensive rebounds per game", volume: 0 },
  { key: "drpg", label: "Defensive rebounding", description: "defensive rebounds per game", volume: 0 },
  { key: "apg", label: "Playmaking", description: "assists per game", volume: 0 },
  { key: "spg", label: "Steals", description: "steals per game", volume: 0 },
  { key: "bpg", label: "Blocks", description: "blocks per game", volume: 0 },
  { key: "fpg", label: "Fouls", description: "fouls per game", volume: 0 },
  { key: "mpg", label: "Workload", description: "minutes per game", volume: 0 },
  { key: "topg", label: "Ball security", description: "fewer turnovers per game", volume: 0 },
  { key: "dbl_dbl", label: "Double-doubles", description: "recorded double-double count", volume: 0 },
  { key: "ts", label: "True shooting", description: "scoring efficiency", volume: 100 },
  { key: "efg", label: "Effective FG", description: "shot efficiency", volume: 100 },
  { key: "half_ts", label: "Half-court TS", description: "half-court true shooting", volume: 100 },
  { key: "three_pct", label: "3-point accuracy", description: "3P%", volume: 50 },
  { key: "two_pct", label: "2-point accuracy", description: "2P%", volume: 50 },
  { key: "ft_pct", label: "Free-throw accuracy", description: "FT%", volume: 50 },
  { key: "per40", label: "Scoring rate", description: "points per 40 minutes", volume: 200 },
  { key: "ast_to", label: "Assist control", description: "assist / turnover ratio", volume: 0 },
  { key: "ast_rate", label: "Assist rate", description: "assist possession rate", volume: 50 },
  { key: "points_poss", label: "Points per possession", description: "points per possession", volume: 0 },
  { key: "usage_rate", label: "Offensive load", description: "estimated usage rate", volume: 50 },
  { key: "stocks40", label: "Defensive events", description: "steals + blocks per 40", volume: 200 },
  { key: "tov_rate", label: "Turnover rate", description: "turnovers per possession", volume: 50 },
  { key: "three_rate", label: "3-point shot rate", description: "3PA / FGA", volume: 50 },
  { key: "ft_rate", label: "Free-throw rate", description: "FTA / FGA", volume: 50 },
  { key: "poss_share", label: "Possession share", description: "share of team possessions", volume: 50 },
  { key: "orb40", label: "Offensive rebounds rate", description: "offensive rebounds per 40", volume: 200 },
  { key: "drb40", label: "Defensive rebounds rate", description: "defensive rebounds per 40", volume: 200 },
  { key: "reb40", label: "Rebounds rate", description: "rebounds per 40", volume: 200 },
  { key: "rim_pct", label: "Rim finishing", description: "rim field-goal percentage", volume: 50 },
  { key: "mid_pct", label: "Midrange accuracy", description: "midrange field-goal percentage", volume: 50 },
  { key: "putback_pct", label: "Putback finishing", description: "putback field-goal percentage", volume: 50 },
  { key: "rim_rate", label: "Rim attempt rate", description: "rim share of attempts", volume: 50 },
  { key: "transition_share", label: "Transition share", description: "transition possession share", volume: 50 },
  { key: "unassisted_rate", label: "Unassisted rate", description: "unassisted scoring rate", volume: 50 },
  { key: "unassisted_share", label: "Unassisted share", description: "unassisted scoring share", volume: 50 },
  { key: "rapm_net", label: "Net RAPM", description: "regularized lineup impact", volume: 0 },
  { key: "orapm", label: "Offensive RAPM", description: "regularized offensive impact", volume: 0 },
  { key: "drapm", label: "Defensive RAPM", description: "regularized defensive impact", volume: 0 },
  { key: "impact_index", label: "Impact index", description: "RAPM + scoring rate", volume: 200 },
  { key: "balanced_index", label: "All-around", description: "balanced production index", volume: 0 },
];

const metricGuidance: Record<Metric, string> = {
  ppg: "Points per game rewards scoring volume and uses recorded games as the denominator.",
  rpg: "Rebounds per game keeps offensive and defensive rebounds together.",
  orpg: "Offensive rebounds per game uses recorded offensive rebounds divided by source games.",
  drpg: "Defensive rebounds per game uses recorded defensive rebounds divided by source games.",
  apg: "Assists per game is a recorded playmaking rate; it does not estimate potential assists.",
  spg: "Steals per game is a box-score defensive event rate.",
  bpg: "Blocks per game is a box-score rim-protection event rate.",
  fpg: "Fouls per game is a recorded personal-foul rate; missing foul totals remain unavailable.",
  mpg: "Minutes per game uses the recorded minute total and source game count.",
  topg: "Lower turnovers per game appear first; turnover rate is available when possession data is recorded.",
  dbl_dbl: "Double-doubles is the publisher-recorded season count; unavailable rows are not treated as zero.",
  ts: "True shooting uses points divided by twice (FGA + 0.475 × FTA); rows without attempts stay unavailable.",
  efg: "Effective field-goal percentage credits a made three as 1.5 field goals: (FGM + 0.5 × 3PM) / FGA.",
  half_ts: "Half-court true shooting is a source-provided shot-context efficiency rate.",
  three_pct: "Three-point accuracy is 3PM / 3PA and keeps players without attempts out of the qualified ranking.",
  two_pct: "Two-point accuracy is made two-point shots divided by two-point attempts.",
  ft_pct: "Free-throw accuracy is FTM / FTA and keeps players without attempts out of the qualified ranking.",
  per40: "Points per 40 normalizes scoring by recorded minutes, which helps compare different workloads.",
  ast_to: "Assist control is assists divided by turnovers; players with no recorded turnovers remain unavailable.",
  ast_rate: "Assist rate is the source possession-based playmaking rate.",
  points_poss: "Points per possession uses recorded points and offensive possessions.",
  usage_rate: "Estimated usage rate is the share of team shooting and turnover possessions used while on the floor; the live board requires a 50-event volume floor.",
  stocks40: "Defensive events per 40 combines steals and blocks, normalized by recorded minutes.",
  tov_rate: "Turnover rate is recorded turnovers divided by recorded offensive possessions.",
  three_rate: "Three-point shot rate is 3PA / FGA, a shot-selection measure rather than accuracy.",
  ft_rate: "Free-throw rate is FTA / FGA, a foul-pressure and shot-profile measure.",
  poss_share: "Possession share is a player’s recorded offensive possessions divided by team possessions.",
  orb40: "Offensive rebound rate normalizes recorded offensive rebounds by 40 minutes.",
  drb40: "Defensive rebound rate normalizes recorded defensive rebounds by 40 minutes.",
  reb40: "Rebound rate normalizes recorded total rebounds by 40 minutes.",
  rim_pct: "Rim finishing is the source-attributed field-goal percentage at the rim.",
  mid_pct: "Midrange accuracy is the source-attributed field-goal percentage in the midrange.",
  putback_pct: "Putback finishing is the source-attributed field-goal percentage on putbacks.",
  rim_rate: "Rim attempt rate is the source-attributed share of attempts at the rim.",
  transition_share: "Transition share is the source-attributed share of transition possessions.",
  unassisted_rate: "Unassisted rate is the source-attributed rate of unassisted scoring.",
  unassisted_share: "Unassisted share is the source-attributed share of scoring without an assist.",
  rapm_net: "Net RAPM is the exact-ID lineup impact estimate; it requires qualified offensive and defensive possession samples.",
  orapm: "Offensive RAPM is the exact-ID regularized offensive lineup impact estimate.",
  drapm: "Defensive RAPM is the exact-ID regularized defensive lineup impact estimate.",
  impact_index: "Impact index averages standardized Net RAPM and scoring rate when both qualified sources are present.",
  balanced_index: "The all-around index averages standardized scoring, rebounding, playmaking, defense, shooting, ball security and per-40 components that are observed.",
};

const selectedMetric = (value: string | null): Metric =>
  metrics.some((metric) => metric.key === value) ? value as Metric : "ppg";

const perGame = (value: number | null, games: number) =>
  value == null || games <= 0 ? null : value / games;

const percentage = (made: number | null, attempted: number | null) =>
  made == null || attempted == null || attempted <= 0 ? null : (100 * made) / attempted;

/** Keep eFG unavailable when either source make total is missing. */
export const effectiveFieldGoalPercent = (
  fgm: number | null,
  tpm: number | null,
  fga: number | null,
) => fgm == null || tpm == null ? null : percentage(fgm + 0.5 * tpm, fga);

export const playerCsvHeaders = [
  "Rank", "Player ID", "Team ID", "Player", "Team", "Position", "Class", "GP", "Minutes", "MPG",
  "Points", "PPG", "Rebounds", "RPG", "Offensive rebounds", "OR/G", "Defensive rebounds", "DR/G",
  "Assists", "APG", "Steals", "SPG", "Blocks", "BPG", "Double-doubles", "Fouls", "PF/G", "Turnovers", "TO/G",
  "FGA", "FGM", "eFG%", "3PA", "3PM", "3P%", "FTA", "FTM", "FT%", "TS%", "Selected metric", "Selected value", "Core stat fields recorded", "Offensive possessions", "Team possessions", "Usage events", "Team usage events", "Team minutes",
];

/** Keep the homepage export aligned with the visible player table and retain raw denominators. */
export function playerCsvRows(rows: LiveNCAAPlayerRow[], metric: Metric): CsvCell[][] {
  return rows.map((row) => {
    const coverage = playerCoreStatCoverage(row);
    const mpg = perGame(row.minutes, row.games);
    const ppg = perGame(row.points, row.games);
    const rpg = perGame(row.rebounds, row.games);
    const orpg = perGame(row.offensive_rebounds, row.games);
    const drpg = perGame(row.defensive_rebounds, row.games);
    const apg = perGame(row.assists, row.games);
    const spg = perGame(row.steals, row.games);
    const bpg = perGame(row.blocks, row.games);
    const fpg = perGame(row.fouls, row.games);
    const topg = perGame(row.turnovers, row.games);
    const efg = effectiveFieldGoalPercent(row.fgm, row.tpm, row.fga);
    const threePct = percentage(row.tpm, row.tpa);
    const ftPct = percentage(row.ftm, row.fta);
    const ts = percentage(row.points, row.fga != null && row.fta != null ? 2 * (row.fga + 0.475 * row.fta) : null);
    return [
      row.rank, row.player_id, row.team_id, row.player_name, row.team_name, row.position, row.class_year,
      row.games, row.minutes, mpg, row.points, ppg, row.rebounds, rpg, row.offensive_rebounds, orpg,
      row.defensive_rebounds, drpg, row.assists, apg, row.steals, spg, row.blocks, bpg, row.double_doubles, row.fouls, fpg,
      row.turnovers, topg, row.fga, row.fgm, efg, row.tpa, row.tpm, threePct, row.fta, row.ftm, ftPct, ts,
      metric, row.value, `${coverage.observed}/${coverage.total}`, row.possessions ?? row.off_poss, row.team_possessions, row.usage_events, row.team_usage_events, row.team_minutes,
    ];
  });
}

export default function LiveNcaaPlayerTable({ season = 2026 }: { season?: number }) {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [metric, setMetric] = useState<Metric>(() => selectedMetric(initial?.get("livePlayerMetric") || null));
  const [query, setQuery] = useState(() => initial?.get("livePlayerQ") || "");
  const [rowLimit, setRowLimit] = useState<10 | 25 | 50>(10);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const selected = metrics.find((candidate) => candidate.key === metric)!;
    setStatus("checking");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        season: String(season),
        metric: selected.key,
        minGames: "5",
        minMinutes: "200",
        minVolume: String(selected.volume),
        page: "0",
      });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/basketball/research/ncaa-player-rankings?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live player archive unavailable");
        return response.json() as Promise<Result>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(payload.rows) || payload.rows.some((row) => !hasExactPlayerSourceIdentity(row))) {
          throw new Error("The player archive returned an incomplete source identity.");
        }
        setResult(payload);
        setStatus(payload.rows?.length ? "ready" : "unavailable");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("unavailable");
        }
      });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [metric, query, season]);

  const active = metrics.find((candidate) => candidate.key === metric)!;
  const percentageMetric = ["ts", "efg", "half_ts", "three_pct", "two_pct", "ft_pct", "tov_rate", "usage_rate", "three_rate", "ft_rate", "ast_rate", "rim_pct", "mid_pct", "putback_pct", "rim_rate", "transition_share", "unassisted_rate", "unassisted_share", "poss_share"].includes(metric);
  const displayMetric = (row: PlayerRow) => {
    if (metric === "balanced_index") return fmt(row.value, 2);
    const value = row.value;
    if (value == null) return "—";
    return percentageMetric
      ? `${fmt(value, 1)}%`
      : fmt(value, 1);
  };
  const downloadVisibleCsv = () => downloadCsv(
    `ncaa-player-production-${season}.csv`,
    toCsv(playerCsvHeaders, playerCsvRows(result?.rows.slice(0, rowLimit) || [], metric)),
  );
  const downloadAllCsv = async () => {
    if (!result || exporting) return;
    const totalRows = Number(result.total);
    const pageSize = Number(result.page_size || 50);
    if (!Number.isInteger(totalRows) || totalRows < 0 || !Number.isInteger(pageSize) || pageSize < 1) {
      setExportMessage("The player archive returned invalid pagination metadata.");
      return;
    }
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    if (totalPages > 1001) {
      setExportMessage("This cohort is larger than the bounded export window. Search for a player or team first.");
      return;
    }
    setExporting(true);
    setExportMessage(`Preparing 0 of ${totalRows.toLocaleString()} rows…`);
    try {
      const rows: PlayerRow[] = [];
      const cohort = `player-export-${Date.now()}`;
      for (let page = 0; page < totalPages; page += 1) {
        const params = new URLSearchParams({
          season: String(season),
          metric,
          minGames: "5",
          minMinutes: "200",
          minVolume: String(metrics.find((candidate) => candidate.key === metric)?.volume || 0),
          page: String(page),
          cohort,
        });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetchWithTransientRetry(`/api/basketball/research/ncaa-player-rankings?${params.toString()}`);
        if (!response.ok) throw new Error("The complete player export could not be loaded.");
        const payload = await response.json() as LiveNCAAPlayerRankingResult;
        rows.push(...validatePlayerExportPage(payload, totalRows, pageSize, page, totalPages));
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows…`);
      }
      if (rows.length !== totalRows) throw new Error("The player archive returned an incomplete export.");
      const identities = new Set(rows.map((row) => `${row.player_id}::${row.team_id}`));
      if (identities.size !== rows.length) throw new Error("The player archive returned duplicate player rows.");
      downloadCsv(`ncaa-player-production-${season}-${metric}-all.csv`, toCsv(playerCsvHeaders, playerCsvRows(rows, metric)));
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} player rows.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete player export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="dashboard-subsection" aria-labelledby="live-ncaa-player-stats">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">LIVE PLAYER DATA</span><h3 id="live-ncaa-player-stats">Division I player production</h3></div>
        <Link href={`/basketball/ncaa-rankings/?season=${season}&metric=${metric}`}>Open full ranking table →</Link>
      </div>
      <p className="dashboard-caption">Current archive rows with a five-game and 200-minute floor. The selected field orders the table; the surrounding production columns stay attached for context. Expand “More recorded stats” under any player for source-retained shot, possession and impact fields.</p>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="control"><span>SEARCH PLAYER / TEAM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or team" aria-label="Search player or team" /></label>
        <label className="control"><span>RANK BY</span><select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{metrics.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label} · {candidate.description}</option>)}</select></label>
        <label className="control"><span>SHOW</span><select value={rowLimit} onChange={(event) => setRowLimit(Number(event.target.value) as 10 | 25 | 50)}><option value={10}>10 rows</option><option value={25}>25 rows</option><option value={50}>50 rows</option></select></label>
        <button className="button secondary" type="button" onClick={downloadVisibleCsv} disabled={!result?.rows.length}>Download visible CSV ↓</button>
        <button className="button secondary" type="button" onClick={downloadAllCsv} disabled={!result?.rows.length || exporting}>{exporting ? "Preparing full CSV…" : "Download full CSV ↓"}</button>
        <p className="note" role="status">{status === "checking" ? "Loading live player rows…" : status === "ready" && result ? `${query.trim() ? `Found ${result.total.toLocaleString()}` : `Showing ${Math.min(rowLimit, result.rows.length)} of ${result.total.toLocaleString()}`} qualified rows · ${active.description}` : "Live player rows are temporarily unavailable."}</p>
      </div>
      {exportMessage ? <p className="note" role="status">{exportMessage}</p> : null}
      <p className="note" style={{ marginBottom: 16 }}>{metricGuidance[metric]} Missing source fields remain unavailable rather than being filled with zero. <Link href={`/basketball/ncaa-rankings/?season=${season}&metric=${metric}`}>Open the full metric table →</Link></p>
      {status === "ready" && result ? (
        <div className="dashboard-table-wrap">
          <table className="data-table dashboard-table">
            <thead><tr><th>Rank</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">MIN</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">OR/G</th><th className="numeric">DR/G</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">DD</th><th className="numeric">PF/G</th><th className="numeric">TO/G</th><th className="numeric">TS%</th><th className="numeric">eFG%</th><th className="numeric">3P%</th><th className="numeric">FT%</th><th className="numeric">Selected</th></tr></thead>
            <tbody>{result.rows.slice(0, rowLimit).map((row) => {
              const coverage = playerCoreStatCoverage(row);
              const detailGroups = playerRecordedDetailGroups(row);
              return <tr key={`${row.player_id}-${row.team_id}`}>
                <td className="rank-number">{row.rank}</td>
                <th scope="row"><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${season}`}>{row.player_name || row.player_id}</Link><small>{row.position || "—"} · {row.class_year || "Class unavailable"}</small><small>{coverage.observed}/{coverage.total} core stat fields recorded</small><small><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${season}`}>Open shot map →</Link></small>{detailGroups.length > 0 && <details className="ranking-recorded-details"><summary>More recorded stats</summary>{detailGroups.map((group) => <div key={group.key}><small><strong>{group.label}</strong></small><div className="ranking-recorded-grid">{group.items.map((item) => <span key={item.label}><small>{item.label}</small><b>{fmt(item.value, item.decimals ?? 0)}{item.percent ? "%" : ""}</b></span>)}</div></div>)}</details>}</th>
                <td>{row.team_name || "—"}<small>Source team ID: {row.team_id}</small></td>
                <td className="numeric">{row.games}</td>
                <td className="numeric">{fmt(row.minutes, 0)}</td>
                <td className="numeric">{fmt(perGame(row.minutes, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.points, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.rebounds, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.offensive_rebounds, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.defensive_rebounds, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.assists, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.steals, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.blocks, row.games))}</td>
                <td className="numeric">{fmt(row.double_doubles, 0)}</td>
                <td className="numeric">{fmt(perGame(row.fouls, row.games))}</td>
                <td className="numeric">{fmt(perGame(row.turnovers, row.games))}</td>
                <td className="numeric">{percentage(row.points, row.fga != null && row.fta != null ? 2 * (row.fga + 0.475 * row.fta) : null) == null ? "—" : `${fmt(percentage(row.points, row.fga != null && row.fta != null ? 2 * (row.fga + 0.475 * row.fta) : null), 1)}%`}</td>
                <td className="numeric">{effectiveFieldGoalPercent(row.fgm, row.tpm, row.fga) == null ? "—" : `${fmt(effectiveFieldGoalPercent(row.fgm, row.tpm, row.fga), 1)}%`}</td>
                <td className="numeric">{percentage(row.tpm, row.tpa) == null ? "—" : `${fmt(percentage(row.tpm, row.tpa), 1)}%`}</td>
                <td className="numeric">{percentage(row.ftm, row.fta) == null ? "—" : `${fmt(percentage(row.ftm, row.fta), 1)}%`}</td>
                <td className="numeric"><strong>{displayMetric(row)}</strong></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : status === "checking" ? <p className="empty" role="status">Loading current player production…</p> : <p className="empty" role="status">Live player production is temporarily unavailable. <Link href="/basketball/ncaa-rankings/">Open the ranking archive →</Link></p>}
    </section>
  );
}
