"use client";
import { useState } from "react";
import Link from "next/link";
import type { BBTeam } from "../../_lib/basketball-types";
import { fmt } from "../../_lib/format";
export default function Ratings({ rows }: { rows: BBTeam[] }) {
  const [q, setQ] = useState(""),
    [sort, setSort] = useState("adj_net");
  const filtered = rows
    .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const key = sort as
        | "adj_net"
        | "adj_off"
        | "adj_def"
        | "adj_tempo"
        | "sos";
      return (
        ((b[key] ?? -999) - (a[key] ?? -999)) * (sort === "adj_def" ? -1 : 1)
      );
    });
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>PROGRAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search programs"
          />
        </label>
        <label className="control">
          <span>SORT</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="adj_net">Adjusted net efficiency</option>
            <option value="adj_off">Offense · higher first</option>
            <option value="adj_def">Defense · lower first</option>
            <option value="adj_tempo">Tempo · faster first</option>
            <option value="sos">Strength of schedule</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Net rank</th>
              <th>Program</th>
              {[
                "Adj O",
                "Adj D",
                "Net",
                "Tempo",
                "SOS",
                "Rated opp.",
                "eFG%",
                "TO%",
                "ORB%",
                "FT rate",
                "3PA rate",
              ].map((k) => (
                <th key={k} className="numeric">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className="rank-number">{t.rank}</td>
                <td>
                  <Link href={`/basketball/programs/${t.id}/`}>{t.name}</Link>
                  <small>
                    {t.wins}–{t.games - t.wins} in paired box-score games
                  </small>
                </td>
                {[
                  t.adj_off,
                  t.adj_def,
                  t.adj_net,
                  t.adj_tempo,
                  t.sos,
                  t.sos_games,
                  ...[
                    t.efg,
                    t.tov_rate,
                    t.orb_rate,
                    t.ft_rate,
                    t.three_rate,
                  ].map((n) => (n == null ? null : n * 100)),
                ].map((v, i) => (
                  <td className="numeric" key={i}>
                    {fmt(v, i === 5 ? 0 : 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="empty">No programs match that search.</p>
      )}
    </>
  );
}
