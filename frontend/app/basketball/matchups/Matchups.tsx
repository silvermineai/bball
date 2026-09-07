"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BBGame, BBRosterSummary } from "../../_lib/basketball-types";
import BasketballCard from "../../_components/BasketballCard";
import { downloadCsv, toCsv } from "../../_lib/csv";
import {
  matchupFilterSearch,
  parseMatchupFilters,
  sortMatchups,
  type MatchupCoverage,
  type MatchupSort,
} from "../../_lib/basketball-matchups";
export default function Matchups({
  games,
  rosterSummaries,
}: {
  games: BBGame[];
  rosterSummaries: BBRosterSummary[];
}) {
  const params = useSearchParams();
  const initial = parseMatchupFilters(params.toString());
  const [q, setQ] = useState(initial.team),
    [month, setMonth] = useState(initial.month),
    [coverage, setCoverage] = useState<MatchupCoverage>(initial.coverage),
    [sort, setSort] = useState<MatchupSort>(initial.sort),
    [page, setPage] = useState(0),
    [copied, setCopied] = useState("");
  useEffect(() => {
    const next = matchupFilterSearch({ team: q, month, coverage, sort });
    if (next !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [q, month, coverage, sort]);
  const rows = sortMatchups(
    games.filter(
      (g) =>
        (g.home_name + " " + g.away_name)
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (month === "all" || g.starts_at.startsWith(month)) &&
        (coverage === "all" ||
          (coverage === "forecasted"
            ? g.prediction != null
            : g.prediction == null)),
    ),
    sort,
  );
  const rosterByTeam = new Map(rosterSummaries.map((summary) => [summary.team_id, summary]));
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Slate link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
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
        <label className="control">
          <span>FORECAST</span>
          <select
            value={coverage}
            onChange={(e) => {
              setCoverage(e.target.value as MatchupCoverage);
              setPage(0);
            }}
          >
            <option value="all">All games</option>
            <option value="forecasted">With model forecast</option>
            <option value="unforecasted">Without forecast</option>
          </select>
        </label>
        <label className="control">
          <span>SORT BY</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as MatchupSort);
              setPage(0);
            }}
          >
            <option value="date">Date</option>
            <option value="confidence">Strongest model signal</option>
            <option value="close">Closest projected margin</option>
            <option value="margin">Largest projected margin</option>
            <option value="uncertainty">Widest margin range</option>
          </select>
        </label>
      </div>
      <p className="note">
        This filtered slate updates the URL, so a preparation view can be
        bookmarked or shared with the exact team, coverage and triage sort.
      </p>
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
                  "Projected total",
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
                  g.prediction?.total,
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
        <button className="button secondary" type="button" onClick={share}>
          Copy slate link
        </button>
      </div>
      {copied && <p role="status">{copied}</p>}
      <div className="match-grid">
        {rows.slice(page * 12, page * 12 + 12).map((g) => (
          <BasketballCard
            key={g.id}
            game={g}
            homeRoster={rosterByTeam.get(g.home_id)}
            awayRoster={rosterByTeam.get(g.away_id)}
          />
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
