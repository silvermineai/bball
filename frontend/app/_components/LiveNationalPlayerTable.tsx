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

export type LiveLeader = {
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

export type LiveLeaderResponse = { rows?: LiveLeader[]; total?: number; limit?: number; pages?: number };

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

type RankedPlayer = NationalPlayerRow & { leader_rank: number | null };

/**
 * The bundled PPG leaders are an outage fallback for the unfiltered default
 * view. They must never survive a search or metric change because those rows
 * do not answer the reader's active query.
 */
export function bundledNationalLeaderRows(
  initialPlayers: NationalPlayerRow[],
  metric: NationalLeaderMetric,
  query: string,
): RankedPlayer[] {
  if (metric !== "ppg" || query.trim()) return [];
  return initialPlayers.map((player) => ({ ...player, leader_rank: player.ppg_rank }));
}

export function resolveNationalLeaderResponse(
  payload: LiveLeaderResponse,
  metric: NationalLeaderMetric,
  query: string,
) {
  const rows = (payload.rows || []).flatMap((raw, index) => {
    const row = normalizeNationalLeader(raw);
    return row ? [{ ...row, leader_rank: metricRank(raw, metric) ?? index + 1 }] : [];
  }).slice(0, 40);
  const responseTotal = Number(payload.total);
  return {
    rows,
    total: Number.isInteger(responseTotal) && responseTotal >= 0 ? responseTotal : rows.length,
    emptyMessage: rows.length
      ? ""
      : query.trim()
        ? "No Division I players match this search and field."
        : "No Division I rows are available for this field.",
  };
}

export default function LiveNationalPlayerTable({
  initialPlayers,
  season,
}: {
  initialPlayers: NationalPlayerRow[];
  season: number;
}) {
  const [metric, setMetric] = useState<NationalLeaderMetric>("ppg");
  const [query, setQuery] = useState("");
  const [rowLimit, setRowLimit] = useState<10 | 25 | 40>(10);
  const [players, setPlayers] = useState<RankedPlayer[]>(() => bundledNationalLeaderRows(initialPlayers, "ppg", ""));
  const [totalRows, setTotalRows] = useState(initialPlayers.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const selectedMetric = leaderMetrics.find((candidate) => candidate.key === metric)!;

  const downloadVisibleCsv = () => {
    downloadCsv(`national-player-leaders-${season}.csv`, toCsv(
      nationalLeaderCsvHeaders,
      nationalLeaderCsvRows(players.slice(0, rowLimit), metric),
    ));
  };
  const normalizeRows = (rawRows: LiveLeader[], selected: NationalLeaderMetric) => resolveNationalLeaderResponse({ rows: rawRows }, selected, "").rows;
  const downloadAllCsv = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMessage(`Preparing 0 of ${totalRows.toLocaleString()} rows…`);
    try {
      const rows: RankedPlayer[] = [];
      let total = totalRows;
      let pages = Math.max(1, Math.ceil(total / 40));
      let expectedPageSize = 40;
      for (let page = 0; page < pages; page += 1) {
        const params = new URLSearchParams({ division: "1", stat: metric, page: String(page) });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/basketball/research/ncaa-leaders?${params.toString()}`);
        if (!response.ok) throw new Error("The complete national leaderboard could not be loaded.");
        const payload = await response.json() as LiveLeaderResponse;
        const pageTotal = Number(payload.total || 0);
        const pageSize = Number(payload.limit || 40);
        const pageCount = Number(payload.pages || Math.max(1, Math.ceil(pageTotal / pageSize)));
        if (!Number.isInteger(pageTotal) || pageTotal < 0 || pageCount < 1 || pageSize < 1) {
          throw new Error("The national leaderboard returned invalid pagination metadata.");
        }
        if (page === 0) {
          total = pageTotal;
          pages = pageCount;
          expectedPageSize = pageSize;
          if (pages > 1001) throw new Error("This cohort exceeds the bounded export window. Search for a player or program first.");
        } else if (pageTotal !== total || pageCount !== pages || pageSize !== expectedPageSize) {
          throw new Error("The national leaderboard changed during export.");
        }
        const pageRows = normalizeRows(payload.rows || [], metric);
        if (pageRows.length > pageSize || (page < pages - 1 && pageRows.length === 0)) {
          throw new Error("The national leaderboard returned an incomplete page.");
        }
        rows.push(...pageRows);
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${total.toLocaleString()} rows…`);
      }
      if (rows.length !== total) throw new Error("The national leaderboard returned an incomplete export.");
      downloadCsv(`national-player-leaders-${season}-${metric}-all.csv`, toCsv(
        nationalLeaderCsvHeaders,
        nationalLeaderCsvRows(rows, metric),
      ));
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} leader rows.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete national leaderboard could not be loaded.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const fallbackRows = bundledNationalLeaderRows(initialPlayers, metric, query);
    setPlayers(fallbackRows);
    const params = new URLSearchParams({ division: "1", stat: metric, page: "0" });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/basketball/research/ncaa-leaders?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live player leaders unavailable");
        return response.json() as Promise<LiveLeaderResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const resolved = resolveNationalLeaderResponse(payload, metric, query);
        setTotalRows(resolved.total);
        setPlayers(resolved.rows);
        setError(resolved.emptyMessage);
      })
      .catch((reason: unknown) => {
        // Keep the server-rendered leaderboard visible if D1 is unavailable.
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setPlayers(fallbackRows);
          setTotalRows(fallbackRows.length);
          setError(fallbackRows.length
            ? "The live leaderboard is temporarily unavailable; showing the bundled points-per-game edition."
            : "The live leaderboard is temporarily unavailable for this field.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialPlayers, metric, query]);

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
          <span>PLAYER OR TEAM</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or team" aria-label="Search national player or team" />
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
        <button className="button secondary" type="button" onClick={downloadAllCsv} disabled={exporting || !players.length}>{exporting ? "Preparing full CSV…" : "Download full CSV ↓"}</button>
        <p className="note" role="status">{loading ? "Loading live Division I leaders…" : `Showing ${Math.min(rowLimit, players.length)} of ${totalRows.toLocaleString()} ${selectedMetric.label.toLowerCase()} leaders. The other columns stay attached for context.`}</p>
      </div>
      {exportMessage ? <p className="note" role="status">{exportMessage}</p> : null}
      {error ? <p className={players.length ? "note" : "empty"} role="status">{error}{players.length ? "" : " Try another field or return to points per game."}</p> : null}
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
