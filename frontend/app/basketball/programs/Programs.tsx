"use client";
import Link from "next/link";
import { useState } from "react";
import type { BBRosters } from "../../_lib/basketball-types";
import type { ScoutIndex } from "../../_lib/scouting-types";
import { fmt, signed } from "../../_lib/format";
export default function Programs({
  teams,
  rosters,
}: {
  teams: ScoutIndex["teams"];
  rosters: BBRosters;
}) {
  const [q, setQ] = useState(""),
    [sort, setSort] = useState("rank");
  const rows = teams
    .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : a.rating.rank - b.rating.rank,
    );
  const rosterByTeam = new Map<string, BBRosters["players"]>();
  for (const player of rosters.players) {
    const current = rosterByTeam.get(player.team_id) ?? [];
    current.push(player);
    rosterByTeam.set(player.team_id, current);
  }
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>PROGRAM</span>
          <input
            type="search"
            placeholder="Find a program"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="control">
          <span>ORDER</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="rank">Adjusted net rating</option>
            <option value="name">Program name</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Model rank</th>
              <th>Program</th>
              <th>2025–26 record</th>
              <th>2026–27 roster observation</th>
              <th className="numeric">Adj. offense</th>
              <th className="numeric">Adj. defense</th>
              <th className="numeric">Adj. net</th>
              <th className="numeric">Tempo</th>
              <th>Workbench</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="rank-number">{t.rating.rank}</td>
                <td>
                  <Link href={`/basketball/programs/${t.id}/`}>{t.name}</Link>
                </td>
                <td>
                  {t.record.wins}–{t.record.losses}
                  {t.record.ties ? `–${t.record.ties}` : ""}
                  <small>{t.record.paired_games} paired box-score games</small>
                </td>
                <td className="program-roster">
                  {(() => {
                    const observed = rosterByTeam.get(t.id) ?? [];
                    const count = (status: string) =>
                      observed.filter((p) => p.status === status).length;
                    return observed.length ? (
                      <>
                        <strong>{observed.length} listed</strong>
                        <small>
                          {count("same_program")} returning · {count("different_program")} transfers · {count("new_to_dataset")} new
                        </small>
                      </>
                    ) : (
                      <small>No source listing</small>
                    );
                  })()}
                </td>
                <td className="numeric">{fmt(t.rating.adj_off)}</td>
                <td className="numeric">{fmt(t.rating.adj_def)}</td>
                <td className="numeric">{signed(t.rating.adj_net)}</td>
                <td className="numeric">{fmt(t.rating.adj_tempo)}</td>
                <td>
                  <Link href={`/basketball/compare/?a=${t.id}`}>
                    Compare ↗
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">No programs match that search.</p>}
      <p className="note">
        {rows.length} programs · lower adjusted defensive efficiency is better.
      </p>
    </>
  );
}
