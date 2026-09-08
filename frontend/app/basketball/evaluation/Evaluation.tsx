"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { date, fmt } from "../../_lib/format";
import {
  evaluate,
  evaluationCsv,
  filterEvaluation,
  reliability,
  type EvaluationGame,
  type EvaluationSummary,
  type Method,
} from "../../_lib/evaluation";
const methods: Method[] = ["preseason", "weekly"];
const labels = { preseason: "Preseason model", weekly: "Weekly challenger" };
const monthLabel = (value: string) =>
  new Date(value + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const percent = (value: number | null) =>
  value === null ? "—" : fmt(value * 100) + "%";

export default function Evaluation({
  summary,
}: {
  summary: EvaluationSummary;
}) {
  const [games, setGames] = useState<EvaluationGame[] | null>(null),
    [error, setError] = useState("");
  const [month, setMonth] = useState(""),
    [venue, setVenue] = useState(""),
    [query, setQuery] = useState("");
  const [order, setOrder] = useState("date"),
    [page, setPage] = useState(0);
  const [selectedBin, setSelectedBin] = useState<{
    method: Method;
    index: number;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/evaluation/games.json", {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "The evaluation games could not be loaded. Please reload.",
          );
        const value = await r.json();
        if (value.experiment_id !== summary.id)
          throw Error(
            "A new experiment is being published. Please reload to use one consistent edition.",
          );
        setGames(value.games);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [summary.id]);
  useEffect(() => {
    setPage(0);
    setSelectedBin(null);
  }, [month, venue, query, order]);
  const rows = useMemo(
    () => filterEvaluation(games || [], month, venue, query),
    [games, month, venue, query],
  );
  const months = useMemo(
    () =>
      [...new Set((games || []).map((g) => g.starts_at.slice(0, 7)))].sort(),
    [games],
  );
  const statistics = useMemo(
    () => ({
      preseason: evaluate(rows, "preseason"),
      weekly: evaluate(rows, "weekly"),
    }),
    [rows],
  );
  const bins = useMemo(
    () => ({
      preseason: reliability(rows, "preseason"),
      weekly: reliability(rows, "weekly"),
    }),
    [rows],
  );
  const monthly = useMemo(
    () =>
      months.map((m) => ({
        month: m,
        ...Object.fromEntries(
          methods.map((method) => [
            method,
            evaluate(filterEvaluation(games || [], m, venue, query), method)
              .margin_mae,
          ]),
        ),
      })) as {
        month: string;
        preseason: number | null;
        weekly: number | null;
      }[],
    [games, months, venue, query],
  );
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const error = (g: EvaluationGame, m: Method) =>
          Math.abs(g[m].home_margin - g.home_score + g.away_score);
        return (
          (order === "error"
            ? error(b, "weekly") - error(a, "weekly")
            : order === "improvement"
              ? error(b, "preseason") -
                error(b, "weekly") -
                (error(a, "preseason") - error(a, "weekly"))
              : a.starts_at.localeCompare(b.starts_at)) ||
          a.id.localeCompare(b.id)
        );
      }),
    [rows, order],
  );
  const active = selectedBin
    ? bins[selectedBin.method][selectedBin.index]
    : null;
  const maxMonth = Math.max(
    1,
    ...monthly.flatMap((m) => [m.preseason || 0, m.weekly || 0]),
  );
  const delta = summary.paired_mae_difference;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([evaluationCsv(sorted)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "basketball-evaluation-2026.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          Experiment 01 / Learning through the season
        </div>
        <h1>
          Does another week
          <br />
          make a better forecast?
        </h1>
        <p>
          A frozen preseason model and a weekly updating challenger, compared on
          the same {summary.coverage.compared_games.toLocaleString()} games from
          2025–26. Inspect the errors, the probabilities and the training behind
          each prediction.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/matchups/">
            Current preseason forecasts ↗
          </Link>
          <a className="hero-link" href="#evaluation-evidence">
            Inspect the evidence ↓
          </a>
        </div>
      </div>
      <div className="evaluation-verdict">
        <div>
          <div className="eyebrow">Retrospective result / Full comparison</div>
          <h2>
            {fmt(Math.abs(delta.difference), 2)} points{" "}
            {delta.difference <= 0 ? "less" : "more"} margin error.
          </h2>
          <p>
            The weekly model’s MAE was{" "}
            {fmt(summary.metrics.weekly.margin_mae, 2)}, compared with{" "}
            {fmt(summary.metrics.preseason.margin_mae, 2)} for the preseason
            model. Winner accuracy was{" "}
            {percent(summary.metrics.weekly.winner_accuracy)} versus{" "}
            {percent(summary.metrics.preseason.winner_accuracy)}.
          </p>
        </div>
        <div>
          <p>
            <strong>This is an experiment, not a live betting record.</strong>{" "}
            It uses currently published historical data and does not replace the
            2026–27 preseason model. Rosters, injuries and market prices are
            absent.
          </p>
          <p className="note">
            Weekly minus preseason MAE: {fmt(delta.difference, 2)} points.
            Approximate 95% week-block bootstrap range: {fmt(delta.low, 2)} to{" "}
            {fmt(delta.high, 2)}. Resamples {delta.weeks} UTC weeks; repeated
            teams across weeks can still be dependent.
          </p>
        </div>
      </div>
      {summary.season_results?.length ? (
        <section className="section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Across dated transitions</div>
              <h2>Does the update travel?</h2>
            </div>
            <span className="note">Independent holdouts · same field rules</span>
          </div>
          <p>
            Each row calibrates on the prior season, freezes that mapping, and
            scores the following season. The 2025 and 2026 tests stay separate
            so a strong year cannot hide a weak transition.
          </p>
          <div className="table-scroll">
            <table className="data-table evaluation-metrics">
              <thead>
                <tr>
                  <th>Test season</th>
                  <th>Calibrated on</th>
                  <th className="numeric">Games</th>
                  <th className="numeric">Preseason MAE</th>
                  <th className="numeric">Weekly MAE</th>
                  <th className="numeric">Weekly winner %</th>
                  <th className="numeric">Weekly fits</th>
                </tr>
              </thead>
              <tbody>
                {summary.season_results.map((result) => (
                  <tr key={result.season}>
                    <th scope="row">{result.season - 1}–{String(result.season).slice(-2)}</th>
                    <td>{result.calibration_season - 1}–{String(result.calibration_season).slice(-2)}</td>
                    <td className="numeric">{result.compared_games.toLocaleString()}</td>
                    <td className="numeric">{fmt(result.metrics.preseason.margin_mae, 2)}</td>
                    <td className="numeric">{fmt(result.metrics.weekly.margin_mae, 2)}</td>
                    <td className="numeric">{percent(result.metrics.weekly.winner_accuracy)}</td>
                    <td className="numeric">{result.weekly_fits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Margin MAE is points. Weekly fits are Monday snapshots; they are
            evidence of temporal replay, not a guarantee of future edge.
          </p>
        </section>
      ) : null}
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">What the models were allowed to know</div>
            <h2>Move forward. Never peek ahead.</h2>
          </div>
        </div>
        <div className="evaluation-timeline">
          <div>
            <span>01 / Before 2024–25</span>
            <h3>Establish the field</h3>
            <p>
              Fit 2023–24 efficiency and tempo. Freeze program membership before
              the next season; ten games in the latest fitting year are
              required.
            </p>
          </div>
          <div>
            <span>02 / During 2024–25</span>
            <h3>Calibrate probabilities</h3>
            <p>
              Generate weekly predictions, then use{" "}
              {summary.coverage.calibration_games.toLocaleString()} games to fit
              the challenger’s probability mapping and 80% margin range. The
              preseason model has its own calibration.
            </p>
          </div>
          <div>
            <span>03 / During 2025–26</span>
            <h3>Replay the next season</h3>
            <p>
              Freeze calibration. Each Monday, refit using earlier completed
              games whose starts precede Sunday 00:00 UTC. Compare with a
              preseason fit that stays fixed all year.
            </p>
          </div>
        </div>
        <p className="note">
          The 24-hour start buffer reduces overlap with unfinished games; it is
          not proof of historical data availability. Source corrections are not
          rolled back. Earlier 2025–26 results may enter later weekly fits, but
          never their own forecast.
        </p>
      </section>
      <section className="section" id="evaluation-evidence">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Explore the same-game comparison</div>
            <h2>Where does the difference appear?</h2>
          </div>
          <span className="note">All filters apply to both models</span>
        </div>
        <div className="toolbar evaluation-controls">
          <label className="control">
            <span>MONTH · UTC</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Full season</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>FLOOR</span>
            <select value={venue} onChange={(e) => setVenue(e.target.value)}>
              <option value="">All venues</option>
              <option value="neutral">Neutral</option>
              <option value="home">Home-designated</option>
            </select>
          </label>
          <label className="control">
            <span>PROGRAM SEARCH</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Duke, Houston, Gonzaga…"
            />
          </label>
          <button
            className="button secondary"
            onClick={() => {
              setMonth("");
              setVenue("");
              setQuery("");
            }}
          >
            Reset filters
          </button>
        </div>
        {error ? (
          <p className="status-error" role="alert">
            {error}
          </p>
        ) : !games ? (
          <p className="empty" role="status">
            Loading the historical comparison…
          </p>
        ) : (
          <>
            <p className="note" aria-live="polite">
              {rows.length.toLocaleString()} matched games in this selection.{" "}
              {rows.length < 100
                ? "Small samples can move sharply; inspect game counts before drawing conclusions."
                : "Filters describe this sample; they do not retrain either model."}
            </p>
            <div className="table-scroll evaluation-metrics">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Games</th>
                    <th>Margin MAE ↓</th>
                    <th>Total MAE ↓</th>
                    <th>Winner accuracy</th>
                    <th>Brier ↓</th>
                    <th>Log loss ↓</th>
                    <th>80% range coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => (
                    <tr key={m}>
                      <td>
                        <span className={`evaluation-key ${m}`} />
                        {labels[m]}
                      </td>
                      <td>{statistics[m].games.toLocaleString()}</td>
                      <td>{fmt(statistics[m].margin_mae, 2)}</td>
                      <td>{fmt(statistics[m].total_mae, 2)}</td>
                      <td>{percent(statistics[m].winner_accuracy)}</td>
                      <td>{fmt(statistics[m].brier, 4)}</td>
                      <td>{fmt(statistics[m].log_loss, 4)}</td>
                      <td>{percent(statistics[m].interval_coverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              MAE is mean absolute error in points. Brier and log loss score
              probability errors; lower is better. The full-season
              constant-home-margin baseline has{" "}
              {fmt(summary.baseline_margin_mae, 2)}-point MAE. Range coverage
              counts final margins inside the published rounded bounds.
            </p>
            <div className="evaluation-charts">
              <div className="paper-panel">
                <h3>Margin error by month</h3>
                <p className="note">
                  Lower bars mean smaller average errors. Select a month to
                  inspect its games. Floor and program filters apply.
                </p>
                <div className="evaluation-months">
                  {monthly.map((m) => (
                    <button
                      key={m.month}
                      className="evaluation-month"
                      aria-pressed={month === m.month}
                      onClick={() => setMonth(month === m.month ? "" : m.month)}
                      aria-label={`Inspect ${monthLabel(m.month)}`}
                    >
                      <span>{monthLabel(m.month)}</span>
                      <div>
                        {methods.map((method) => (
                          <div
                            className={`evaluation-month-bar ${method}`}
                            key={method}
                          >
                            <i
                              style={{
                                width: `${((m[method] || 0) / maxMonth) * 100}%`,
                              }}
                            />
                            <strong>{fmt(m[method], 2)}</strong>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="evaluation-legend">
                  {methods.map((m) => (
                    <span key={m}>
                      <i className={`evaluation-key ${m}`} />
                      {labels[m]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="paper-panel">
                <h3>Do 70% teams win 70% of the time?</h3>
                <p className="note">
                  Home win probability grouped into ten fixed bins. Points on
                  the diagonal agree with observed win rates. Focus or hover a
                  point for its sample.
                </p>
                <svg
                  className="evaluation-calibration"
                  viewBox="0 0 420 330"
                  role="group"
                  aria-label="Calibration plot comparing forecast home-win probability with observed frequency"
                >
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <g key={t}>
                      <line
                        x1="52"
                        y1={270 - t * 225}
                        x2="377"
                        y2={270 - t * 225}
                        stroke="var(--line)"
                      />
                      <text x="43" y={275 - t * 225} textAnchor="end">
                        {t * 100}%
                      </text>
                      <text x={52 + t * 325} y="291" textAnchor="middle">
                        {t * 100}%
                      </text>
                    </g>
                  ))}
                  <line
                    x1="52"
                    y1="270"
                    x2="377"
                    y2="45"
                    stroke="var(--muted)"
                    strokeDasharray="5 5"
                  />
                  <text x="215" y="322" textAnchor="middle">
                    Predicted home-win probability
                  </text>
                  <text x="52" y="20">
                    Observed home-win rate
                  </text>
                  {methods.map((method) =>
                    bins[method]
                      .filter((b) => b.count)
                      .map((b) => (
                        <circle
                          key={`${method}-${b.index}`}
                          tabIndex={0}
                          role="button"
                          aria-label={`${labels[method]}, ${b.index * 10} to ${(b.index + 1) * 10}% bin, ${b.count} games, predicted ${percent(b.predicted)}, observed ${percent(b.observed)}`}
                          cx={52 + b.predicted! * 325}
                          cy={270 - b.observed! * 225}
                          r={
                            selectedBin?.method === method &&
                            selectedBin.index === b.index
                              ? 8
                              : 6
                          }
                          className={method}
                          onMouseEnter={() =>
                            setSelectedBin({ method, index: b.index })
                          }
                          onFocus={() =>
                            setSelectedBin({ method, index: b.index })
                          }
                          onClick={() =>
                            setSelectedBin({ method, index: b.index })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedBin({ method, index: b.index });
                            }
                          }}
                        />
                      )),
                  )}
                </svg>
                <p className="evaluation-bin-detail" aria-live="polite">
                  {active && selectedBin
                    ? `${labels[selectedBin.method]} · ${active.count} games · predicted ${percent(active.predicted)} · observed ${percent(active.observed)}`
                    : "Select a point to inspect its game count and probability."}
                </p>
                <details>
                  <summary>Read the calibration values</summary>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Method / probability bin</th>
                          <th>Games</th>
                          <th>Predicted</th>
                          <th>Observed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {methods.flatMap((method) =>
                          bins[method].map((b) => (
                            <tr key={`${method}-${b.index}`}>
                              <td>
                                {labels[method]} · {b.index * 10}–
                                {(b.index + 1) * 10}%
                              </td>
                              <td>{b.count}</td>
                              <td>{percent(b.predicted)}</td>
                              <td>{percent(b.observed)}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </div>
            <section className="section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    Every prediction has a training cutoff
                  </div>
                  <h2>Inspect the games.</h2>
                </div>
                <button
                  className="button secondary"
                  onClick={download}
                  disabled={!rows.length}
                >
                  Download selected CSV ↓
                </button>
              </div>
              <label className="control evaluation-sort">
                <span>ORDER GAMES</span>
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                >
                  <option value="date">Date · earliest first</option>
                  <option value="error">Largest weekly margin error</option>
                  <option value="improvement">
                    Largest weekly improvement
                  </option>
                </select>
              </label>
              <p className="note">
                Margins are home minus away. Positive means the designated home
                team. Actual scores include overtime; model scores use
                regulation pace.
              </p>
              <div className="table-scroll">
                <table className="data-table evaluation-game-table">
                  <thead>
                    <tr>
                      <th>Date / matchup</th>
                      <th>Final · away–home</th>
                      <th>Actual margin</th>
                      <th>Preseason margin</th>
                      <th>Weekly margin</th>
                      <th>Weekly home win</th>
                      <th>Weekly evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(page * 30, (page + 1) * 30).map((g) => (
                      <tr key={g.id}>
                        <td>
                          <small>
                            {date(g.starts_at)} ·{" "}
                            {g.neutral ? "Neutral" : "Home-designated"}
                          </small>
                          <Link href={`/basketball/programs/${g.away_id}/`}>
                            {g.away_name}
                          </Link>
                          <span> at </span>
                          <Link href={`/basketball/programs/${g.home_id}/`}>
                            {g.home_name}
                          </Link>
                        </td>
                        <td>
                          {g.away_score}–{g.home_score}
                          {(g.periods ?? 0) > 2 ? " OT" : ""}
                        </td>
                        <td>{fmt(g.home_score - g.away_score)}</td>
                        <td>{fmt(g.preseason.home_margin)}</td>
                        <td>{fmt(g.weekly.home_margin)}</td>
                        <td>{percent(g.weekly.home_win_probability)}</td>
                        <td>
                          <details>
                            <summary>Fit & error</summary>
                            <p>
                              Absolute margin error:{" "}
                              {fmt(
                                Math.abs(
                                  g.weekly.home_margin -
                                    g.home_score +
                                    g.away_score,
                                ),
                                2,
                              )}{" "}
                              points.
                            </p>
                            <p>
                              Training starts strictly before{" "}
                              {g.training_before}.
                            </p>
                            <p>
                              80% margin range: {fmt(g.weekly.margin_low)} to{" "}
                              {fmt(g.weekly.margin_high)}.
                            </p>
                            <p className="mono">Fit {g.weekly_fit_id}</p>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <p className="empty">No games match these filters.</p>
              )}
              <div className="pagination">
                <span>
                  {rows.length.toLocaleString()} games · page {page + 1} of{" "}
                  {Math.max(1, Math.ceil(rows.length / 30))}
                </span>
                <div>
                  <button disabled={!page} onClick={() => setPage(page - 1)}>
                    Previous
                  </button>
                  <button
                    disabled={(page + 1) * 30 >= rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </section>
      <section className="section two-col">
        <div className="paper-panel">
          <h2>Account for the missing games.</h2>
          <div className="rule-list">
            <div>
              <span>Completed schedule records</span>
              <strong>
                {summary.coverage.completed_schedule_games.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Usable paired box scores</span>
              <strong>
                {summary.coverage.paired_box_games.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Same-game comparison</span>
              <strong>
                {summary.coverage.compared_games.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Outside the frozen program field</span>
              <strong>{summary.coverage.outside_field.toLocaleString()}</strong>
            </div>
          </div>
          <p>
            Both methods exclude the same out-of-field games. The source is not
            a certified Division I membership list. These counts describe this
            source edition.
          </p>
          <p>
            <Link href="/research/scorecard/?sport=basketball">
              Use the prospective ledger
            </Link>{" "}
            to distinguish forecasts actually registered before games from
            historical experiments.
          </p>
        </div>
        <div className="paper-panel">
          <h2>Reproduce the comparison.</h2>
          <p>
            Download game predictions, all weekly coefficients and training-game
            IDs, the calibration sample, and the file hash manifest.
          </p>
          <div className="evaluation-downloads">
            {[
              ["summary.json", "Summary & source receipts"],
              ["games.json", "All evaluation predictions"],
              [
                "calibration-games.json",
                "Calibration predictions · not a test",
              ],
              ["fits.json", "Every fit & training-game ID"],
              ["manifest.json", "SHA-256 manifest"],
            ].map(([file, label]) => (
              <a
                href={`/data/basketball/evaluation/${file}`}
                key={file}
                download
              >
                {label} ↓
              </a>
            ))}
          </div>
          <p className="note">
            Experiment edition: {date(summary.generated_at)}. Dataset edition:{" "}
            {date(summary.source_edition)}.
          </p>
          <p className="note mono evaluation-id">{summary.id}</p>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Interpretation & provenance</div>
            <h2>What this experiment cannot establish.</h2>
          </div>
        </div>
        <div className="two-col">
          {summary.limitations.map((text) => (
            <p className="note" key={text}>
              {text}
            </p>
          ))}
        </div>
        <p className="note">
          Temporal evaluation and calibration references:{" "}
          <a href="https://scikit-learn.org/stable/modules/cross_validation.html#time-series-split">
            scikit-learn’s time-series evaluation guidance
          </a>{" "}
          and{" "}
          <a href="https://scikit-learn.org/stable/modules/calibration.html">
            probability calibration documentation
          </a>
          . Source data:{" "}
          <a href="https://github.com/sportsdataverse/sportsdataverse-data">
            SportsDataverse
          </a>
          , labeled CC BY 4.0 by its publisher. Source receipts and download
          URLs are in the summary.{" "}
          <Link href="/basketball/model/">
            Read the production model notebook →
          </Link>
        </p>
      </section>
    </>
  );
}
