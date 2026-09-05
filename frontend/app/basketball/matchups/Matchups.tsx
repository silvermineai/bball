"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BBGame } from "../../_lib/basketball-types";
import BasketballCard from "../../_components/BasketballCard";
export default function Matchups({ games }: { games: BBGame[] }) {
  const params = useSearchParams(),
    [q, setQ] = useState(params.get("team") || ""),
    [month, setMonth] = useState("all"),
    [page, setPage] = useState(0);
  const rows = games.filter(
    (g) =>
      (g.home_name + " " + g.away_name)
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (month === "all" || g.starts_at.startsWith(month)),
  );
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>TEAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search a program"
          />
        </label>
        <label className="control">
          <span>MONTH</span>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All published months</option>
            {[...new Set(games.map((g) => g.starts_at.slice(0, 7)))]
              .sort()
              .map((m) => (
                <option key={m}>{m}</option>
              ))}
          </select>
        </label>
      </div>
      <p className="note" style={{ marginBottom: 20 }}>
        {rows.length} games · partial schedule · times Eastern when confirmed
      </p>
      <div className="match-grid">
        {rows.slice(page * 12, page * 12 + 12).map((g) => (
          <BasketballCard key={g.id} game={g} />
        ))}
      </div>
      {!rows.length && (
        <p className="empty">No published games match these filters.</p>
      )}
      <div className="pagination">
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 12))}
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
            disabled={(page + 1) * 12 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </>
  );
}
