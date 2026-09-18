"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../_lib/format";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";

export type NationalPlayerRow = {
  player_id: number | string;
  division: number;
  name: string;
  team_name: string | null;
  conference: string | null;
  games: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg?: number | null;
  bpg?: number | null;
  fouls?: number | null;
  turnovers?: number | null;
  fg_pct: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  ppg_rank: number | null;
};

export type NationalLeaderMetric = "ppg" | "rpg" | "apg" | "spg" | "bpg" | "fg_pct" | "three_pct" | "ft_pct";

const leaderMetrics: Array<{ key: NationalLeaderMetric; label: string; rankLabel: string }> = [
  { key: "ppg", label: "Points per game", rankLabel: "PPG" },
  { key: "rpg", label: "Rebounds per game", rankLabel: "RPG" },
  { key: "apg", label: "Assists per game", rankLabel: "APG" },
  { key: "spg", label: "Steals per game", rankLabel: "SPG" },
  { key: "bpg", label: "Blocks per game", rankLabel: "BPG" },
  { key: "fg_pct", label: "Field-goal percentage", rankLabel: "FG%" },
  { key: "three_pct", label: "3-point percentage", rankLabel: "3P%" },
  { key: "ft_pct", label: "Free-throw percentage", rankLabel: "FT%" },
];

type LiveLeader = {
  player_id?: number | string;
  name?: string | null;
  team_name?: string | null;
  ppg?: number | null;
  rpg?: number | null;
  apg?: number | null;
  spg?: number | null;
  bpg?: number | null;
  fouls?: number | null;
  turnovers?: number | null;
  pf?: number | null;
  tov?: number | null;
  fg_pct?: number | null;
  three_pct?: number | null;
  ft_pct?: number | null;
  publisher_rank?: number | null;
  payload?: (Partial<NationalPlayerRow> & { pf?: number | null; tov?: number | null }) | null;
};

export function normalizeNationalLeader(row: LiveLeader): NationalPlayerRow | null {
  const payload = row.payload || {};
  if (row.player_id == null || !row.name) return null;
  return {
    player_id: row.player_id,
    division: 1,
    name: row.name,
    team_name: row.team_name ?? payload.team_name ?? null,
    conference: payload.conference ?? null,
    games: payload.games ?? null,
    ppg: row.ppg ?? payload.ppg ?? null,
    rpg: row.rpg ?? payload.rpg ?? null,
    apg: row.apg ?? payload.apg ?? null,
    spg: row.spg ?? payload.spg ?? null,
    bpg: row.bpg ?? payload.bpg ?? null,
    fouls: row.fouls ?? row.pf ?? payload.fouls ?? payload.pf ?? null,
    turnovers: row.turnovers ?? row.tov ?? payload.turnovers ?? payload.tov ?? null,
    fg_pct: row.fg_pct ?? payload.fg_pct ?? null,
    three_pct: row.three_pct ?? payload.three_pct ?? null,
    ft_pct: row.ft_pct ?? payload.ft_pct ?? null,
    ppg_rank: row.publisher_rank ?? payload.ppg_rank ?? null,
  };
}

export function metricValue(row: NationalPlayerRow, metric: NationalLeaderMetric) {
  return row[metric] ?? null;
}

export const nationalLeaderCsvHeaders = [
  "Rank", "Player ID", "Player", "Team", "Conference", "GP", "PPG", "RPG", "APG", "SPG", "BPG", "PF/G", "TO/G", "FG%", "3P%", "FT%", "Selected metric", "Selected value",
];

export function nationalLeaderCsvRows(
  rows: Array<NationalPlayerRow & { leader_rank: number | null }>,
  metric: NationalLeaderMetric,
): CsvCell[][] {
  return rows.map((player) => {
    const perGame = (value: number | null | undefined) => value == null || player.games == null || player.games <= 0 ? null : value / player.games;
    return [
      player.leader_rank,
      player.player_id,
      player.name,
      player.team_name,
      player.conference,
      player.games,
      player.ppg,
      player.rpg,
      player.apg,
      player.spg,
      player.bpg,
      perGame(player.fouls),
      perGame(player.turnovers),
      player.fg_pct,
      player.three_pct,
      player.ft_pct,
      metric,
      metricValue(player, metric),
    ];
  });
}

const metricRank = (row: LiveLeader, metric: NationalLeaderMetric) => {
  const payload = row.payload || {};
  if (row.publisher_rank != null) return row.publisher_rank;
  const rank = payload[`${metric}_rank` as keyof NationalPlayerRow];
  return typeof rank === "number" ? rank : null;
};

export default function LiveNationalPlayerTable({
  initialPlayers,
  season,
}: {
  initialPlayers: NationalPlayerRow[];
  season: number;
}) {
  type RankedPlayer = NationalPlayerRow & { leader_rank: number | null };
  const [metric, setMetric] = useState<NationalLeaderMetric>("ppg");
  const [rowLimit, setRowLimit] = useState<10 | 25 | 40>(10);
  const [players, setPlayers] = useState<RankedPlayer[]>(() => initialPlayers.map((player) => ({ ...player, leader_rank: player.ppg_rank })));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedMetric = leaderMetrics.find((candidate) => candidate.key === metric)!;

  const downloadVisibleCsv = () => {
    downloadCsv(`national-player-leaders-${season}.csv`, toCsv(
      nationalLeaderCsvHeaders,
      nationalLeaderCsvRows(players.slice(0, rowLimit), metric),
    ));
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPlayers(metric === "ppg" ? initialPlayers.map((player) => ({ ...player, leader_rank: player.ppg_rank })) : []);
    fetch(`/api/basketball/research/ncaa-leaders?division=1&stat=${metric}&page=0`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live player leaders unavailable");
        return response.json() as Promise<{ rows?: LiveLeader[] }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const rows = (payload.rows || []).flatMap((raw, index) => {
          const row = normalizeNationalLeader(raw);
          return row ? [{ ...row, leader_rank: metricRank(raw, metric) ?? index + 1 }] : [];
        }).slice(0, 40);
        if (rows.length) setPlayers(rows);
        else setError("No Division I rows are available for this field.");
      })
      .catch((reason: unknown) => {
        // Keep the server-rendered leaderboard visible if D1 is unavailable.
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setError("The live leaderboard is temporarily unavailable for this field.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialPlayers, metric]);

  const pct = (value: number | null) => value == null ? "—" : `${fmt(value)}%`;
  const perGame = (value: number | null | undefined, games: number | null) => value == null || games == null || games <= 0 ? null : value / games;
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="control">
          <span>LEADERBOARD FIELD</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value as NationalLeaderMetric)}>
            {leaderMetrics.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
          </select>
        </label>
        <label className="control">
          <span>SHOW</span>
          <select value={rowLimit} onChange={(event) => setRowLimit(Number(event.target.value) as 10 | 25 | 40)}>
            <option value={10}>10 players</option>
            <option value={25}>25 players</option>
            <option value={40}>40 players</option>
          </select>
        </label>
        <button className="button secondary" type="button" onClick={downloadVisibleCsv} disabled={!players.length}>Download visible CSV ↓</button>
        <p className="note" role="status">{loading ? "Loading live Division I leaders…" : `Showing ${Math.min(rowLimit, players.length)} ${selectedMetric.label.toLowerCase()} leaders. The other columns stay attached for context.`}</p>
      </div>
      {error && !players.length ? <p className="empty" role="status">{error} Try another field or return to points per game.</p> : null}
      <div className="dashboard-table-wrap" aria-busy={loading}>
        <table className="data-table dashboard-table">
          <thead><tr><th>{selectedMetric.rankLabel} rank</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">SPG</th><th className="numeric">BPG</th><th className="numeric">PF/G</th><th className="numeric">TO/G</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th className="numeric">FT%</th></tr></thead>
          <tbody>{players.slice(0, rowLimit).map((player) => (
          <tr key={player.player_id}>
            <td className="rank-number">{player.leader_rank ?? "—"}</td>
            <th scope="row"><Link href={`/basketball/ncaa-player/?id=${player.player_id}&season=${season}`}>{player.name}</Link><small>{player.conference || "Conference unavailable"}</small></th>
            <td>{player.team_name || "—"}</td>
            <td className="numeric">{player.games ?? "—"}</td>
            <td className="numeric">{metric === "ppg" ? <strong>{fmt(metricValue(player, "ppg"))}</strong> : fmt(metricValue(player, "ppg"))}</td>
            <td className="numeric">{metric === "rpg" ? <strong>{fmt(metricValue(player, "rpg"))}</strong> : fmt(metricValue(player, "rpg"))}</td>
            <td className="numeric">{metric === "apg" ? <strong>{fmt(metricValue(player, "apg"))}</strong> : fmt(metricValue(player, "apg"))}</td>
            <td className="numeric">{metric === "spg" ? <strong>{fmt(metricValue(player, "spg"))}</strong> : fmt(metricValue(player, "spg"))}</td>
            <td className="numeric">{metric === "bpg" ? <strong>{fmt(metricValue(player, "bpg"))}</strong> : fmt(metricValue(player, "bpg"))}</td>
            <td className="numeric">{fmt(perGame(player.fouls, player.games))}</td>
            <td className="numeric">{fmt(perGame(player.turnovers, player.games))}</td>
            <td className="numeric">{metric === "fg_pct" ? <strong>{pct(metricValue(player, "fg_pct"))}</strong> : pct(metricValue(player, "fg_pct"))}</td>
            <td className="numeric">{metric === "three_pct" ? <strong>{pct(metricValue(player, "three_pct"))}</strong> : pct(metricValue(player, "three_pct"))}</td>
            <td className="numeric">{metric === "ft_pct" ? <strong>{pct(metricValue(player, "ft_pct"))}</strong> : pct(metricValue(player, "ft_pct"))}</td>
          </tr>
        ))}</tbody>
        </table>
      </div>
    </>
  );
}
