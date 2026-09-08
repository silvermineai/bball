"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FootballEfficiencyScenario, Game } from "../../_lib/data";
import MatchCard from "../../_components/MatchCard";
import { date } from "../../_lib/format";
export default function MatchupBrowser({
  games,
  generated,
  efficiencyScenarios = [],
}: {
  games: Game[];
  generated: string;
  efficiencyScenarios?: FootballEfficiencyScenario[];
}) {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("team") || ""),
    [week, setWeek] = useState("all"),
    [mode, setMode] = useState("all"),
    [page, setPage] = useState(0);
  const rows = games.filter(
    (g) =>
      (
        g.home_name +
        " " +
        g.away_name +
        " " +
        g.home_conference +
        " " +
        g.away_conference
      )
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (week === "all" || String(g.week) === week) &&
      (mode === "all" || g.prediction),
  );
  const scenarioByGame = new Map(efficiencyScenarios.map((scenario) => [scenario.game_id, scenario]));
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>TEAM OR CONFERENCE</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Try Ohio State or Big Ten"
          />
        </label>
        <label className="control">
          <span>WEEK</span>
          <select
            value={week}
            onChange={(e) => {
              setWeek(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All weeks</option>
            {[...new Set(games.map((g) => g.week))]
              .sort((a, b) => a - b)
              .map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
          </select>
        </label>
        <label className="control">
          <span>SHOW</span>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All scheduled games</option>
            <option value="forecast">With a model forecast</option>
          </select>
        </label>
      </div>
      <p className="note" style={{ marginBottom: 22 }}>
        {rows.length} matchups · Generated {date(generated)} · Published
        forecasts are snapshots, not a live feed.
      </p>
      <div className="match-grid">
        {rows.slice(page * 12, page * 12 + 12).map((g) => (
          <MatchCard key={g.id} game={g} efficiencyScenario={scenarioByGame.get(g.id)} />
        ))}
      </div>
      {!rows.length && (
        <p className="empty">
          No matchups match these filters. Try a different team or week.
        </p>
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
