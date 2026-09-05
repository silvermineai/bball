"use client";
import { useState } from "react";
import Link from "next/link";
import type { BBPlayer } from "../../_lib/basketball-types";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { fmt } from "../../_lib/format";
export default function Players() {
  const { data, error } = useBasketballRelease<{ players: BBPlayer[] }>(
    "players",
  );
  const [q, setQ] = useState(""),
    [sort, setSort] = useState("ppg"),
    [qualified, setQualified] = useState(true),
    [page, setPage] = useState(0);
  const rows = (data?.players || [])
    .filter(
      (p) =>
        (p.name + " " + p.team).toLowerCase().includes(q.toLowerCase()) &&
        (!qualified || p.qualified),
    )
    .sort((a, b) => {
      const key = sort as "ppg" | "rpg" | "apg" | "ts" | "mpg";
      return (
        (b[key] ?? -999) - (a[key] ?? -999) || a.name.localeCompare(b.name)
      );
    });
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>PLAYER OR PROGRAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search players"
          />
        </label>
        <label className="control">
          <span>SORT</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="ppg">Points per game</option>
            <option value="rpg">Rebounds per game</option>
            <option value="apg">Assists per game</option>
            <option value="ts">True shooting</option>
            <option value="mpg">Minutes per game</option>
          </select>
        </label>
      </div>
      <label className="note">
        <input
          type="checkbox"
          checked={qualified}
          onChange={(e) => {
            setQualified(e.target.checked);
            setPage(0);
          }}
        />{" "}
        At least 15 games and 400 minutes, with complete box-score fields
      </label>
      <p className="note" style={{ marginBottom: 20 }}>
        TS uses PTS / [2 × (FGA + 0.475 FTA)]. This is an estimate; the college
        free-throw coefficient differs from the commonly used NBA 0.44.
        Incomplete totals remain unavailable.
      </p>
      {error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p role="status" className="empty">
          Loading player statistics…
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player / program</th>
                  <th>Pos.</th>
                  {[
                    "GP",
                    "MIN/G",
                    "PTS/G",
                    "REB/G",
                    "AST/G",
                    "STL/G",
                    "BLK/G",
                    "eFG%",
                    "TS%",
                    "3P%",
                  ].map((k) => (
                    <th className="numeric" key={k}>
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => (
                  <tr key={`${p.id}-${p.team_id}`}>
                    <td>
                      <Link href={`/basketball/player/?id=${p.id}`}>
                        {p.name}
                      </Link>
                      <small>{p.team}</small>
                    </td>
                    <td>{p.position || "—"}</td>
                    {[
                      p.games,
                      p.mpg,
                      p.ppg,
                      p.rpg,
                      p.apg,
                      p.spg,
                      p.bpg,
                      ...[p.efg, p.ts, p.three_pct].map((n) =>
                        n == null ? null : n * 100,
                      ),
                    ].map((v, i) => (
                      <td className="numeric" key={i}>
                        {fmt(v, i === 0 ? 0 : 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">No players match these filters.</p>
          )}
          <div className="pagination">
            <span>
              {rows.length.toLocaleString()} players · page {page + 1} of{" "}
              {Math.max(1, Math.ceil(rows.length / 40))}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                ← Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * 40 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
