"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BBGame, BBOverview, BBRosterScenario } from "../../_lib/basketball-types";
import type { Comparison } from "../../_lib/research-types";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { date, fmt, kick } from "../../_lib/format";
import ManualMarketCheck from "../briefs/ManualMarketCheck";

type View = "all" | "scenario" | "cold-start" | "market";
type Sort = "date" | "disagreement" | "confidence" | "uncertainty";

const validViews = new Set<View>(["all", "scenario", "cold-start", "market"]);
const validSorts = new Set<Sort>(["date", "disagreement", "confidence", "uncertainty"]);

type Row = {
  game: BBGame;
  prediction: NonNullable<BBGame["prediction"]>;
  scenario: BBRosterScenario | null;
  comparisons: Comparison[];
};

function numeric(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function parseInitial(search: string) {
  const params = new URLSearchParams(search);
  const view = params.get("view") as View | null;
  const sort = params.get("sort") as Sort | null;
  return {
    query: params.get("q") || "",
    view: view && validViews.has(view) ? view : "all",
    sort: sort && validSorts.has(sort) ? sort : "date",
  };
}

function modelRow(game: BBGame, scenario: BBRosterScenario | undefined, comparisons: Comparison[] | undefined): Row | null {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
  return { game, prediction, scenario: scenario || null, comparisons: comparisons || [] };
}

function sortRows(rows: Row[], sort: Sort) {
  return [...rows].sort((a, b) => {
    if (sort === "date") return a.game.starts_at.localeCompare(b.game.starts_at);
    if (sort === "disagreement") {
      return Math.abs(b.scenario?.margin_delta || 0) - Math.abs(a.scenario?.margin_delta || 0)
        || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    if (sort === "confidence") {
      const ac = Math.max(a.prediction.home_win_probability, 1 - a.prediction.home_win_probability);
      const bc = Math.max(b.prediction.home_win_probability, 1 - b.prediction.home_win_probability);
      return bc - ac || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    return (b.prediction.margin_high - b.prediction.margin_low) - (a.prediction.margin_high - a.prediction.margin_low)
      || a.game.starts_at.localeCompare(b.game.starts_at);
  });
}

export default function ForecastLab({
  overview,
  scenarios,
  markets,
}: {
  overview: BBOverview;
  scenarios: BBRosterScenario[];
  markets: Record<string, Comparison[]>;
}) {
  const params = useSearchParams();
  const initial = parseInitial(params.toString());
  const [query, setQuery] = useState(initial.query);
  const [view, setView] = useState<View>(initial.view);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [marketGameId, setMarketGameId] = useState("");
  const scenarioByGame = useMemo(() => new Map(scenarios.map((row) => [row.game_id, row])), [scenarios]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (view !== "all") next.set("view", view);
    if (sort !== "date") next.set("sort", sort);
    const value = next.toString();
    window.history.replaceState(window.history.state, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
  }, [query, sort, view]);

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const candidates = overview.upcoming
      .filter((game) => !search || `${game.home_name} ${game.away_name}`.toLowerCase().includes(search))
      .map((game) => modelRow(game, scenarioByGame.get(game.id), markets[game.id]));
    return sortRows(
      candidates.filter((row): row is Row => !!row).filter((row) => {
        if (view === "scenario") return !!row.scenario;
        if (view === "cold-start") return !row.game.prediction && !!row.game.fallback_prediction;
        if (view === "market") return row.comparisons.length > 0;
        return true;
      }),
      sort,
    );
  }, [markets, overview.upcoming, query, scenarioByGame, sort, view]);

  const scenarioCount = rows.filter((row) => row.scenario).length;
  const disagreement = rows.filter((row) => row.scenario).reduce((best, row) => Math.max(best, Math.abs(row.scenario!.margin_delta)), 0);
  const marketRow = rows.find((row) => row.game.id === marketGameId) || rows[0];
  const exportRows = () => downloadCsv(
    "basketball-forecast-lab.csv",
    toCsv(
      ["Scheduled start", "Away", "Home", "Estimate type", "Primary home margin", "Roster scenario home margin", "Roster delta", "Home win probability", "Margin range low", "Margin range high", "Verified market observations", "Brief"],
      rows.map((row) => [
        row.game.starts_at,
        row.game.away_name,
        row.game.home_name,
        row.game.prediction ? "primary" : "cold-start",
        row.prediction.home_margin,
        row.scenario?.roster_margin,
        row.scenario?.margin_delta,
        row.prediction.home_win_probability * 100,
        row.prediction.margin_low,
        row.prediction.margin_high,
        row.comparisons.length,
        row.game.prediction ? `https://bball.silvermine.dev/basketball/briefs/${row.game.id}/` : null,
      ]),
    ),
  );

  return (
    <>
      <div className="toolbar">
        <label className="control"><span>PROGRAM</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search either program" /></label>
        <label className="control"><span>VIEW</span><select value={view} onChange={(event) => setView(event.target.value as View)}><option value="all">All modeled games</option><option value="scenario">Roster challenger available</option><option value="cold-start">Cold-start estimates</option><option value="market">Verified market observations</option></select></label>
        <label className="control"><span>ORDER</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="date">Scheduled date</option><option value="disagreement">Largest roster disagreement</option><option value="confidence">Strongest primary signal</option><option value="uncertainty">Widest primary range</option></select></label>
      </div>
      <p className="note">This board compares published model artifacts. The roster challenger is a research scenario and does not change the primary probability, interval, ledger registration or market interpretation.</p>
      <div className="strip" style={{ borderTop: "1px solid var(--ink)" }}>
        <div><strong>{rows.length.toLocaleString()}</strong><span>Games in view</span></div>
        <div><strong>{scenarioCount.toLocaleString()}</strong><span>Roster scenarios</span></div>
        <div><strong>{disagreement ? `${numeric(disagreement)} pts` : "—"}</strong><span>Largest scenario shift</span></div>
        <div><strong>{overview.model.version}</strong><span>Primary model edition</span></div>
      </div>
      {marketRow && (
        <section className="section market-workbench">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Reader tool / Manual quote check</div>
              <h2>Test a line against any game in view.</h2>
            </div>
            <span className="note">Browser only · never published</span>
          </div>
          <label className="control market-game-picker">
            <span>GAME</span>
            <select value={marketRow.game.id} onChange={(event) => setMarketGameId(event.target.value)}>
              {rows.map((row) => <option value={row.game.id} key={row.game.id}>{row.game.away_name} at {row.game.home_name} · {date(row.game.starts_at)}</option>)}
            </select>
          </label>
          <ManualMarketCheck
            homeName={marketRow.game.home_name}
            modelMargin={marketRow.prediction.home_margin}
            modelTotal={marketRow.prediction.total}
            modelHomeWinProbability={marketRow.prediction.home_win_probability}
          />
        </section>
      )}
      <div className="section-heading" style={{ marginTop: 28, marginBottom: 20 }}>
        <p>{rows.length.toLocaleString()} modeled games · generated {date(overview.generated_at)} · primary cutoff {date(overview.model.cutoff)}</p>
        <button className="button secondary" type="button" onClick={exportRows}>Download comparison CSV ↓</button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Game</th><th>Primary model</th><th>Roster challenger</th><th>Range / confidence</th><th>Sources</th></tr></thead>
          <tbody>{rows.map((row) => {
            const p = row.prediction;
            const confidence = Math.max(p.home_win_probability, 1 - p.home_win_probability);
            return <tr key={row.game.id}>
              <td><strong>{row.game.away_name} at {row.game.home_name}</strong><small>{row.game.time_tbd ? `${date(row.game.starts_at)} · time TBD` : kick(row.game.starts_at)}{row.game.neutral ? " · neutral" : ""}</small>{row.game.prediction && <small><Link href={`/basketball/briefs/${row.game.id}/`}>Open matchup brief →</Link></small>}</td>
              <td className="numeric"><strong>{numeric(p.home_margin, 1)}</strong><small>{numeric(p.home_win_probability * 100)}% home · {numeric(p.total, 1)} total</small><small>{row.game.prediction ? "primary" : "cold-start"}</small></td>
              <td className="numeric">{row.scenario ? <><strong>{numeric(row.scenario.roster_margin, 1)}</strong><small>{row.scenario.margin_delta >= 0 ? "+" : ""}{numeric(row.scenario.margin_delta, 1)} pts vs primary</small><small>prior net + exact-ID continuity</small></> : <span>—</span>}</td>
              <td className="numeric"><strong>{numeric(p.margin_low, 1)} to {numeric(p.margin_high, 1)}</strong><small>{numeric(confidence * 100)}% strongest-side confidence</small><small>{numeric(p.pace, 1)} possessions</small></td>
              <td>{row.comparisons.length ? <><strong>{row.comparisons.length} verified quote{row.comparisons.length === 1 ? "" : "s"}</strong><small>{row.comparisons[0].bookmaker} · {row.comparisons[0].market}</small></> : <span className="muted">No verified market quote</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">No modeled games match this view.</p>}
      <section className="section two-col" style={{ marginTop: 34 }}>
        <div className="paper-panel"><div className="eyebrow">Read the disagreement</div><h2>Primary model first. Scenario second.</h2><p>The primary forecast is the historical opponent-adjusted efficiency and tempo model. The roster challenger uses prior net efficiency plus exact source-athlete-ID continuity and prior minutes. A positive scenario delta moves the modeled home margin up; it is a research prompt, not an adjusted win probability.</p></div>
        <div className="paper-panel"><div className="eyebrow">Verify the inputs</div><h2>Every row has a trail.</h2><p>Open a matchup brief for Four Factors, historical workload, source roster observations and the research ledger. Market rows appear only when a licensed pregame quote matched the exact game, participants and start time.</p><p><Link href="/basketball/model/">Read the model notebook →</Link> · <Link href="/basketball/recruiting/">Review recruiting evidence →</Link></p></div>
      </section>
    </>
  );
}
