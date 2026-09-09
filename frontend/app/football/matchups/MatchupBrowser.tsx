"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FootballEfficiencyScenario, Game } from "../../_lib/data";
import MatchCard from "../../_components/MatchCard";
import { date } from "../../_lib/format";
import {
  loadLiveFootballForecasts,
  mergeLiveFootballForecasts,
} from "../../_lib/live-football-forecasts";
import {
  matchesFootballMatchupSignal,
  parseFootballMatchupSignal,
  parseFootballMatchupSort,
  sortFootballMatchups,
  type FootballMatchupSignal,
  type FootballMatchupSort,
} from "../../_lib/football-matchup-view";
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
  const requestedPage = Number(params.get("page") || 0);
  const requestedWeek = params.get("week");
  const initialWeek = requestedWeek && /^\d{1,2}$/.test(requestedWeek) ? requestedWeek : "all";
  const [query, setQuery] = useState(params.get("team") || ""),
    [week, setWeek] = useState(initialWeek),
    [mode, setMode] = useState<"all" | "forecast">(params.get("show") === "forecast" ? "forecast" : "all"),
    [signal, setSignal] = useState<FootballMatchupSignal>(parseFootballMatchupSignal(params.get("signal"))),
    [sort, setSort] = useState<FootballMatchupSort>(parseFootballMatchupSort(params.get("sort"))),
    [page, setPage] = useState(Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 250 ? requestedPage : 0),
    [copied, setCopied] = useState(""),
    [liveGames, setLiveGames] = useState<Game[] | null>(null),
    [liveError, setLiveError] = useState("");
  const activeGames = liveGames || games;
  const filteredRows = activeGames.filter(
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
      (mode === "all" || g.prediction) &&
      matchesFootballMatchupSignal(g.prediction, signal),
  );
  const rows = sortFootballMatchups(filteredRows, sort);
  const scenarioByGame = new Map(efficiencyScenarios.map((scenario) => [scenario.game_id, scenario]));

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("team", query.trim());
    else url.searchParams.delete("team");
    if (week !== "all") url.searchParams.set("week", week);
    else url.searchParams.delete("week");
    if (mode === "forecast") url.searchParams.set("show", mode);
    else url.searchParams.delete("show");
    if (signal !== "all") url.searchParams.set("signal", signal);
    else url.searchParams.delete("signal");
    if (sort !== "date") url.searchParams.set("sort", sort);
    else url.searchParams.delete("sort");
    if (page) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [mode, page, query, signal, sort, week]);

  useEffect(() => {
    const controller = new AbortController();
    loadLiveFootballForecasts(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setLiveGames(mergeLiveFootballForecasts(games, rows));
          setLiveError("");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLiveError(reason instanceof Error ? reason.message : "Live football forecasts unavailable.");
        }
      });
    return () => controller.abort();
  }, [games]);
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
            {[...new Set(activeGames.map((g) => g.week))]
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
              setMode(e.target.value as "all" | "forecast");
              setPage(0);
            }}
          >
            <option value="all">All scheduled games</option>
            <option value="forecast">With a model forecast</option>
          </select>
        </label>
        <label className="control">
          <span>MODEL SIGNAL</span>
          <select
            value={signal}
            onChange={(e) => {
              setSignal(e.target.value as FootballMatchupSignal);
              setPage(0);
            }}
          >
            <option value="all">All forecast signals</option>
            <option value="toss-up">Toss-ups · under 60%</option>
            <option value="lean">Leans · 60–74.9%</option>
            <option value="strong">Strong leans · 75%+</option>
          </select>
        </label>
        <label className="control">
          <span>SORT BY</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as FootballMatchupSort);
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
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied("Slate link copied.");
            } catch {
              setCopied("Copy the filtered URL from your address bar.");
            }
          }}
        >
          Copy slate link
        </button>
      </div>
      {copied && <p className="note" role="status">{copied}</p>}
      <p className="note" style={{ marginBottom: 22 }}>
        {rows.length} matchups · Generated {date(generated)} · {liveGames
          ? "Live D1 forecast rows are applied to the published cards."
          : liveError
            ? `${liveError} Showing the published snapshot.`
            : "Checking the live D1 forecast edition…"}
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
