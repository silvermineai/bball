"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../_lib/format";

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
  fg_pct: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  ppg_rank: number | null;
};

type LiveLeader = {
  player_id?: number | string;
  name?: string | null;
  team_name?: string | null;
  ppg?: number | null;
  publisher_rank?: number | null;
  payload?: Partial<NationalPlayerRow> | null;
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
    rpg: payload.rpg ?? null,
    apg: payload.apg ?? null,
    fg_pct: payload.fg_pct ?? null,
    three_pct: payload.three_pct ?? null,
    ft_pct: payload.ft_pct ?? null,
    ppg_rank: row.publisher_rank ?? payload.ppg_rank ?? null,
  };
}

export default function LiveNationalPlayerTable({
  initialPlayers,
  season,
}: {
  initialPlayers: NationalPlayerRow[];
  season: number;
}) {
  const [players, setPlayers] = useState(initialPlayers);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/ncaa-leaders?division=1&stat=ppg&page=0", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live player leaders unavailable");
        return response.json() as Promise<{ rows?: LiveLeader[] }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const rows = (payload.rows || []).map(normalizeNationalLeader).filter((row): row is NationalPlayerRow => !!row).slice(0, 10);
        if (rows.length) setPlayers(rows);
      })
      .catch(() => {
        // Keep the server-rendered leaderboard visible if D1 is unavailable.
      });
    return () => controller.abort();
  }, [initialPlayers]);

  const pct = (value: number | null) => value == null ? "—" : `${fmt(value)}%`;
  return (
    <div className="dashboard-table-wrap">
      <table className="data-table dashboard-table">
        <thead><tr><th>PPG rank</th><th>Player</th><th>Team</th><th className="numeric">GP</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">FG%</th><th className="numeric">3P%</th><th className="numeric">FT%</th></tr></thead>
        <tbody>{players.map((player) => (
          <tr key={player.player_id}>
            <td className="rank-number">{player.ppg_rank ?? "—"}</td>
            <th scope="row"><Link href={`/basketball/ncaa-player/?id=${player.player_id}&season=${season}`}>{player.name}</Link><small>{player.conference || "Conference unavailable"}</small></th>
            <td>{player.team_name || "—"}</td>
            <td className="numeric">{player.games ?? "—"}</td>
            <td className="numeric"><strong>{fmt(player.ppg)}</strong></td>
            <td className="numeric">{fmt(player.rpg)}</td>
            <td className="numeric">{fmt(player.apg)}</td>
            <td className="numeric">{pct(player.fg_pct)}</td>
            <td className="numeric">{pct(player.three_pct)}</td>
            <td className="numeric">{pct(player.ft_pct)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
