"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BBGame } from "../../_lib/basketball-types";
import BasketballCard from "../../_components/BasketballCard";
import { downloadCsv, toCsv } from "../../_lib/csv";
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
      <div className="section-heading" style={{ marginBottom: 20 }}>
        <p>
          {rows.length} games · partial schedule · times Eastern when confirmed
        </p>
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            downloadCsv(
              "basketball-2026-27-matchups.csv",
              toCsv(
                [
                  "Scheduled start",
                  "Away program",
                  "Home program",
                  "Venue",
                  "Projected away score",
                  "Projected home score",
                  "Home win probability",
                  "Projected home margin",
                  "Margin range low",
                  "Margin range high",
                  "Projected pace",
                  "Broadcast",
                ],
                rows.map((g) => [
                  g.starts_at,
                  g.away_name,
                  g.home_name,
                  g.venue,
                  g.prediction?.away_score,
                  g.prediction?.home_score,
                  g.prediction?.home_win_probability == null
                    ? null
                    : g.prediction.home_win_probability * 100,
                  g.prediction?.home_margin,
                  g.prediction?.margin_low,
                  g.prediction?.margin_high,
                  g.prediction?.pace,
                  g.broadcast,
                ]),
              ),
            )
          }
        >
          Download CSV ↓
        </button>
      </div>
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
