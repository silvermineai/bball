"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../_lib/format";

type Metric = "ppg" | "rpg" | "apg" | "spg" | "bpg" | "topg" | "ts" | "efg" | "three_pct" | "ft_pct" | "per40" | "ast_to" | "stocks40" | "tov_rate" | "three_rate" | "ft_rate" | "poss_share" | "rapm_net" | "impact_index" | "balanced_index";

type PlayerRow = {
  player_id: string;
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
  turnovers: number | null;
  fga: number | null;
  fgm: number | null;
  tpa: number | null;
  tpm: number | null;
  fta: number | null;
  ftm: number | null;
  value: number | null;
  rank: number;
};

type Result = {
  season: number;
  metric: Metric;
  total: number;
  rows: PlayerRow[];
};

const metrics: Array<{ key: Metric; label: string; description: string; volume: number }> = [
  { key: "ppg", label: "Scoring", description: "points per game", volume: 0 },
  { key: "rpg", label: "Rebounding", description: "rebounds per game", volume: 0 },
  { key: "apg", label: "Playmaking", description: "assists per game", volume: 0 },
  { key: "spg", label: "Steals", description: "steals per game", volume: 0 },
  { key: "bpg", label: "Blocks", description: "blocks per game", volume: 0 },
  { key: "topg", label: "Ball security", description: "turnovers per game", volume: 0 },
  { key: "ts", label: "True shooting", description: "scoring efficiency", volume: 100 },
  { key: "efg", label: "Effective FG", description: "shot efficiency", volume: 100 },
  { key: "three_pct", label: "3-point accuracy", description: "3P%", volume: 50 },
  { key: "ft_pct", label: "Free-throw accuracy", description: "FT%", volume: 50 },
  { key: "per40", label: "Scoring rate", description: "points per 40 minutes", volume: 200 },
  { key: "ast_to", label: "Assist control", description: "assist / turnover ratio", volume: 0 },
  { key: "stocks40", label: "Defensive events", description: "steals + blocks per 40", volume: 200 },
  { key: "tov_rate", label: "Turnover rate", description: "turnovers per possession", volume: 50 },
  { key: "three_rate", label: "3-point shot rate", description: "3PA / FGA", volume: 50 },
  { key: "ft_rate", label: "Free-throw rate", description: "FTA / FGA", volume: 50 },
  { key: "poss_share", label: "Possession share", description: "share of team possessions", volume: 50 },
  { key: "rapm_net", label: "Net RAPM", description: "regularized lineup impact", volume: 0 },
  { key: "impact_index", label: "Impact index", description: "RAPM + scoring rate", volume: 200 },
  { key: "balanced_index", label: "All-around", description: "balanced production index", volume: 0 },
];

const selectedMetric = (value: string | null): Metric =>
  metrics.some((metric) => metric.key === value) ? value as Metric : "ppg";

const perGame = (value: number | null, games: number) =>
  value == null || games <= 0 ? null : value / games;

const percentage = (made: number | null, attempted: number | null) =>
  made == null || attempted == null || attempted <= 0 ? null : (100 * made) / attempted;

export default function LiveNcaaPlayerTable({ season = 2026 }: { season?: number }) {
  const initial = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [metric, setMetric] = useState<Metric>(() => selectedMetric(initial?.get("livePlayerMetric") || null));
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");

  useEffect(() => {
    const controller = new AbortController();
    const selected = metrics.find((candidate) => candidate.key === metric)!;
    setStatus("checking");
    fetch(`/api/basketball/research/ncaa-player-rankings?season=${season}&metric=${selected.key}&minGames=5&minMinutes=200&minVolume=${selected.volume}&page=0`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live player archive unavailable");
        return response.json() as Promise<Result>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setResult(payload);
        setStatus(payload.rows?.length ? "ready" : "unavailable");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("unavailable");
        }
      });
    return () => controller.abort();
  }, [metric, season]);

  const active = metrics.find((candidate) => candidate.key === metric)!;
  const percentageMetric = ["ts", "efg", "three_pct", "ft_pct", "tov_rate", "three_rate", "ft_rate", "poss_share"].includes(metric);
  const displayMetric = (row: PlayerRow) => {
    if (metric === "balanced_index") return fmt(row.value, 2);
    const value = row.value;
    if (value == null) return "—";
    return percentageMetric
      ? `${fmt(value, 1)}%`
      : fmt(value, 1);
  };

  return (
    <section className="dashboard-subsection" aria-labelledby="live-ncaa-player-stats">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">LIVE PLAYER DATA</span><h3 id="live-ncaa-player-stats">NCAA player production</h3></div>
        <Link href={`/basketball/ncaa-rankings/?season=${season}&metric=${metric}`}>Open full ranking table →</Link>
      </div>
      <p className="dashboard-caption">Current archive rows with a five-game and 200-minute floor. The selected field orders the table; the surrounding production columns stay attached for context.</p>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="control"><span>RANK BY</span><select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{metrics.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label} · {candidate.description}</option>)}</select></label>
        <p className="note" role="status">{status === "checking" ? "Loading live player rows…" : status === "ready" && result ? `${result.total.toLocaleString()} qualified rows · ${active.description}` : "Live player rows are temporarily unavailable."}</p>
      </div>
      {status === "ready" && result ? (
        <div className="dashboard-table-wrap">
          <table className="data-table dashboard-table">
            <thead><tr><th>Rank</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">MIN</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">OR/G</th><th className="numeric">DR/G</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">TO/G</th><th className="numeric">TS%</th><th className="numeric">eFG%</th><th className="numeric">3P%</th><th className="numeric">FT%</th><th className="numeric">Selected</th></tr></thead>
            <tbody>{result.rows.slice(0, 10).map((row) => (
              <tr key={`${row.player_id}-${row.team_name || ""}`}>
                <td className="rank-number">{row.rank}</td>
                <th scope="row"><Link href={`/basketball/ncaa-player/?id=${encodeURIComponent(row.player_id)}&season=${season}`}>{row.player_name || row.player_id}</Link><small>{row.position || "—"} · {row.class_year || "Class unavailable"}</small></th>
                <td>{row.team_name || "—"}</td>
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
                <td className="numeric">{fmt(perGame(row.turnovers, row.games))}</td>
                <td className="numeric">{percentage(row.points, row.fga != null && row.fta != null ? 2 * (row.fga + 0.475 * row.fta) : null) == null ? "—" : `${fmt(percentage(row.points, row.fga != null && row.fta != null ? 2 * (row.fga + 0.475 * row.fta) : null), 1)}%`}</td>
                <td className="numeric">{percentage((row.fgm ?? 0) + 0.5 * (row.tpm ?? 0), row.fga) == null ? "—" : `${fmt(percentage((row.fgm ?? 0) + 0.5 * (row.tpm ?? 0), row.fga), 1)}%`}</td>
                <td className="numeric">{percentage(row.tpm, row.tpa) == null ? "—" : `${fmt(percentage(row.tpm, row.tpa), 1)}%`}</td>
                <td className="numeric">{percentage(row.ftm, row.fta) == null ? "—" : `${fmt(percentage(row.ftm, row.fta), 1)}%`}</td>
                <td className="numeric"><strong>{displayMetric(row)}</strong></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : status === "checking" ? <p className="empty" role="status">Loading current player production…</p> : <p className="empty" role="status">Live player production is temporarily unavailable. <Link href="/basketball/ncaa-rankings/">Open the ranking archive →</Link></p>}
    </section>
  );
}
