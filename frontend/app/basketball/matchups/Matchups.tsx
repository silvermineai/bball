"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { BBGame, BBRosterScenario, BBRosterSummary } from "../../_lib/basketball-types";
import BasketballCard from "../../_components/BasketballCard";
import { downloadCsv, toCsv } from "../../_lib/csv";
import type { BBOverview } from "../../_lib/basketball-types";
import {
  matchupFilterSearch,
  parseMatchupFilters,
  sortMatchups,
  type MatchupCoverage,
  type MatchupSort,
} from "../../_lib/basketball-matchups";
export default function Matchups({
  games,
  marketComparisons,
  rosterSummaries,
  model,
  generatedAt,
  rosterScenarios = [],
}: {
  games: BBGame[];
  marketComparisons: Record<string, NonNullable<BBGame["market_comparisons"]>>;
  rosterSummaries: BBRosterSummary[];
  model: BBOverview["model"];
  generatedAt: string;
  rosterScenarios?: BBRosterScenario[];
}) {
  const params = useSearchParams();
  const initial = parseMatchupFilters(params.toString());
  const [q, setQ] = useState(initial.team),
    [month, setMonth] = useState(initial.month),
    [coverage, setCoverage] = useState<MatchupCoverage>(initial.coverage),
    [sort, setSort] = useState<MatchupSort>(initial.sort),
    [page, setPage] = useState(initial.page),
    [copied, setCopied] = useState("");
  useEffect(() => {
    const next = matchupFilterSearch({ team: q, month, coverage, sort, page });
    if (next !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [q, month, coverage, sort, page]);
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
  const rosterScenarioByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
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
            <option value="unforecasted">Without primary forecast</option>
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
      <p className="note">
        Forecast edition {generatedAt.slice(0, 10)} · model {model.version} · training cutoff {model.cutoff}. Read the <Link href="/basketball/model/">model notebook</Link> for fitting windows, held-out results and limitations.
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
                  "Estimate type",
                ],
                rows.map((g) => [
                  g.starts_at,
                  g.away_name,
                  g.home_name,
                  g.venue,
                  (g.prediction || g.fallback_prediction)?.away_score,
                  (g.prediction || g.fallback_prediction)?.home_score,
                  (g.prediction || g.fallback_prediction)?.home_win_probability == null
                    ? null
                    : (g.prediction || g.fallback_prediction)!.home_win_probability * 100,
                  (g.prediction || g.fallback_prediction)?.home_margin,
                  (g.prediction || g.fallback_prediction)?.total,
                  (g.prediction || g.fallback_prediction)?.margin_low,
                  (g.prediction || g.fallback_prediction)?.margin_high,
                  (g.prediction || g.fallback_prediction)?.pace,
                  g.broadcast,
                  g.prediction ? "primary" : g.fallback_prediction ? "cold-start" : null,
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
        <Link className="button secondary" href="/research/scorecard/?sport=basketball">
          Forecast record
        </Link>
      </div>
      {copied && <p role="status">{copied}</p>}
      <div className="match-grid">
        {rows.slice(page * 12, page * 12 + 12).map((g) => (
          <BasketballCard
            key={g.id}
            game={marketComparisons[g.id]?.length ? { ...g, market_comparisons: marketComparisons[g.id] } : g}
            homeRoster={rosterByTeam.get(g.home_id)}
            awayRoster={rosterByTeam.get(g.away_id)}
            rosterScenario={rosterScenarioByGame.get(g.id)}
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
