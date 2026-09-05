"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmt } from "../../_lib/format";
import {
  featureCsv,
  featureLabels,
  featureMetrics,
  featureRows,
  methodLabels,
  type FeatureGame,
  type FeatureMethod,
  type FeatureSummary,
} from "../../_lib/football-features";
const methods: FeatureMethod[] = ["weekly", "control", "efficiency"];
const monthLabel = (value: string) =>
  new Date(value + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const probability = (value: number | null) =>
  value === null ? "—" : fmt(100 * value) + "%";
export default function Features({ summary }: { summary: FeatureSummary }) {
  const [games, setGames] = useState<FeatureGame[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [q, setQ] = useState(""),
    [month, setMonth] = useState(""),
    [minimum, setMinimum] = useState(0),
    [page, setPage] = useState(0),
    [sort, setSort] = useState("change");
  useEffect(() => {
    const c = new AbortController();
    setGames(null);
    setError("");
    fetch("/data/football/features/games.json", { signal: c.signal })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "The experiment games could not be loaded. Retry the download.",
          );
        const value = await r.json();
        if (value.experiment_id !== summary.id)
          throw Error(
            "This page and its games use different experiment editions. Reload the page.",
          );
        if (!c.signal.aborted) setGames(value.games);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [summary.id, retry]);
  useEffect(() => setPage(0), [q, month, minimum, sort]);
  const filtered = useMemo(
    () => featureRows(games || [], q, month, minimum),
    [games, q, month, minimum],
  );
  const rows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (sort === "change"
            ? Math.abs(b.efficiency.home_margin - b.control.home_margin) -
              Math.abs(a.efficiency.home_margin - a.control.home_margin)
            : a.starts_at.localeCompare(b.starts_at)) ||
          a.id.localeCompare(b.id),
      ),
    [filtered, sort],
  );
  const stats = Object.fromEntries(
    methods.map((method) => [method, featureMetrics(rows, method)]),
  ) as Record<FeatureMethod, ReturnType<typeof featureMetrics>>;
  const months = [
    ...new Set((games || []).map((r) => r.starts_at.slice(0, 7))),
  ].sort();
  const monthly = months.map((m) => {
    const selected = featureRows(games || [], q, m, minimum);
    return {
      month: m,
      n: selected.length,
      control: featureMetrics(selected, "control").margin_mae,
      efficiency: featureMetrics(selected, "efficiency").margin_mae,
    };
  });
  const maximum = Math.max(
    1,
    ...monthly.flatMap((m) => [m.control || 0, m.efficiency || 0]),
  );
  const d = summary.paired_difference;
  const inconclusive = d.low <= 0 && d.high >= 0;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([featureCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "football-efficiency-experiment.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = () => {
    setQ("");
    setMonth("");
    setMinimum(0);
    setPage(0);
  };
  return (
    <>
      <section className="evaluation-verdict">
        <div>
          <div className="eyebrow">
            Full historical test / Primary comparison
          </div>
          <h2>
            {inconclusive
              ? "No clear gain from the extra features."
              : d.difference < 0
                ? "Lower historical margin error."
                : "Higher historical margin error."}
          </h2>
          <p>
            Score + efficiency:{" "}
            <strong>{fmt(summary.metrics.efficiency.margin_mae, 2)}</strong>{" "}
            points of margin error. Score-only correction:{" "}
            <strong>{fmt(summary.metrics.control.margin_mae, 2)}</strong>. The
            difference is {fmt(d.difference, 3)} points; the approximate 95%
            week-block range is {fmt(d.low, 3)} to {fmt(d.high, 3)}.
          </p>
        </div>
        <p>
          This is an exploratory, retrospective comparison. Settings were
          recorded after the historical season and after the original weekly
          benchmark was known. Source corrections and publication delays are not
          reconstructed. Current forecasts and prospective ledger records are
          unchanged.
        </p>
      </section>
      <section
        className="feature-timeline section"
        aria-label="Experiment timeline"
      >
        <div>
          <span className="eyebrow">2023 / Learn the correction</span>
          <strong>{summary.coverage.training_games} games</strong>
          <p>
            Fit both residual models and their feature scaling. Freeze those
            coefficients for later seasons.
          </p>
        </div>
        <div>
          <span className="eyebrow">2024 / Calibrate</span>
          <strong>{summary.coverage.calibration_games} games</strong>
          <p>
            Fit a separate probability curve and nominal 80% margin range for
            each model.
          </p>
        </div>
        <div>
          <span className="eyebrow">2025 / Evaluate</span>
          <strong>{summary.coverage.evaluation_games} games</strong>
          <p>
            Compare the same matchups. Earlier results update later weekly score
            fits and feature inputs.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              Shared sample / Explore the test games
            </div>
            <h2>Where did the predictions change?</h2>
          </div>
          <button
            className="button secondary"
            disabled={!games || !rows.length}
            onClick={download}
          >
            Download selected CSV
          </button>
        </div>
        <div className="toolbar">
          <label className="control">
            <span>PROGRAM SEARCH</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Texas, Ohio State…"
            />
          </label>
          <label className="control">
            <span>MONTH · UTC</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All test months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>MINIMUM MARGIN CHANGE</span>
            <select
              value={minimum}
              onChange={(e) => setMinimum(+e.target.value)}
            >
              {[0, 1, 2, 4].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "All games" : `${v}+ points`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="note">
          Margin change compares score + efficiency with the score-only
          correction. All tables use the same selected games. Monthly bars keep
          program and change filters and let you select a month; the full-test
          uncertainty range above is fixed.
        </p>
        {error ? (
          <div role="alert" className="empty">
            {error}{" "}
            <button
              className="button secondary"
              onClick={() => setRetry(retry + 1)}
            >
              Retry experiment
            </button>
          </div>
        ) : !games ? (
          <p role="status" className="empty">
            Loading paired historical predictions…
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table feature-metrics">
                <thead>
                  <tr>
                    {[
                      "Method",
                      "Games",
                      "Margin MAE ↓",
                      "Margin RMSE ↓",
                      "Winner accuracy",
                      "Brier ↓",
                      "80% range coverage",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => (
                    <tr key={m}>
                      <th scope="row">{methodLabels[m]}</th>
                      <td>{stats[m].games}</td>
                      <td>{fmt(stats[m].margin_mae, 2)}</td>
                      <td>{fmt(stats[m].margin_rmse, 2)}</td>
                      <td>{probability(stats[m].winner_accuracy)}</td>
                      <td>{fmt(stats[m].brier, 4)}</td>
                      <td>{probability(stats[m].interval_coverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              The original weekly model is a reference. The primary test is
              between the two corrected models, which share training seasons and
              fitting rules. Total forecasts are unchanged. Brier measures
              probability error; lower is better.
            </p>
            <div className="feature-months" aria-label="Monthly margin error">
              {monthly.map((m) => (
                <button
                  key={m.month}
                  disabled={!m.n}
                  onClick={() => setMonth(month === m.month ? "" : m.month)}
                  aria-pressed={month === m.month}
                  aria-label={`Inspect ${monthLabel(m.month)}, ${m.n} games`}
                >
                  <strong>{monthLabel(m.month)}</strong>
                  <small>{m.n} games · MAE</small>
                  <span className="feature-month-bar">
                    <span
                      style={{
                        width: `${(100 * (m.control || 0)) / maximum}%`,
                      }}
                    />
                  </span>
                  <span className="feature-month-bar candidate">
                    <span
                      style={{
                        width: `${(100 * (m.efficiency || 0)) / maximum}%`,
                      }}
                    />
                  </span>
                  <small>
                    Score {fmt(m.control, 2)} · + Efficiency{" "}
                    {fmt(m.efficiency, 2)}
                  </small>
                </button>
              ))}
            </div>
            {!rows.length && (
              <p className="empty">No games match these filters.</p>
            )}
            <div className="section-heading">
              <button className="button secondary" onClick={reset}>
                Reset filters
              </button>
              <label className="control">
                <span>ORDER GAMES</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="change">Largest margin change</option>
                  <option value="date">Kickoff date</option>
                </select>
              </label>
            </div>
            <div className="table-scroll">
              <table className="data-table feature-games">
                <thead>
                  <tr>
                    {[
                      "Game / designated home team",
                      "Actual home margin",
                      "Score-only correction",
                      "Score + efficiency",
                      "Change",
                      "Inspect model inputs",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 25, page * 25 + 25).map((g) => (
                    <tr key={g.id}>
                      <th scope="row">
                        {g.away_name} at {g.home_name}
                        <small>
                          {new Date(g.starts_at).toLocaleDateString("en-US", {
                            timeZone: "UTC",
                          })}
                          {g.neutral ? " · neutral site" : ""} · final{" "}
                          {g.away_score}–{g.home_score}
                        </small>
                      </th>
                      <td>{fmt(g.home_score - g.away_score)}</td>
                      <td>
                        {fmt(g.control.home_margin, 2)}
                        <small>
                          {probability(g.control.home_win_probability)} home win
                        </small>
                      </td>
                      <td>
                        {fmt(g.efficiency.home_margin, 2)}
                        <small>
                          {probability(g.efficiency.home_win_probability)} home
                          win
                        </small>
                      </td>
                      <td>
                        {fmt(
                          g.efficiency.home_margin - g.control.home_margin,
                          2,
                        )}
                      </td>
                      <td>
                        <details>
                          <summary>Feature evidence</summary>
                          <div className="feature-inputs">
                            <p>
                              <strong>Strict input cutoff:</strong>{" "}
                              {g.training_before}. Only prior kickoff times
                              enter this week’s state. This does not reconstruct
                              when the publisher posted the statistics.
                            </p>
                            <p>
                              Original weekly margin:{" "}
                              {fmt(g.weekly.home_margin, 2)}. The candidate adds{" "}
                              {fmt(g.contributions.efficiency.correction, 2)}{" "}
                              points to that margin.
                            </p>
                            <table>
                              <thead>
                                <tr>
                                  <th>Input · home minus away</th>
                                  <th>Value</th>
                                  <th>Candidate correction contribution</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <th>Intercept</th>
                                  <td>1</td>
                                  <td>
                                    {fmt(
                                      g.contributions.efficiency.intercept,
                                      3,
                                    )}
                                  </td>
                                </tr>
                                {featureLabels.map((label, i) => (
                                  <tr key={label}>
                                    <th>{label}</th>
                                    <td>{fmt(g.features[i], 4)}</td>
                                    <td>
                                      {fmt(
                                        g.contributions.efficiency.features[i],
                                        3,
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="note">
                              Contributions use standardized inputs and sum to
                              the candidate’s correction relative to the
                              original weekly forecast. They are model terms,
                              not causal effects. The score-only correction has
                              its own fitted coefficient.
                            </p>
                            <p className="source-hash">
                              Feature state: {g.feature_state_id}
                              <br />
                              Weekly fit: {g.weekly_fit_id}
                            </p>
                            <a
                              className="hero-link"
                              href="/data/football/features/feature-states.json"
                            >
                              Download all dated states and training IDs →
                            </a>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {rows.length} games · page {page + 1} of{" "}
                {Math.max(1, Math.ceil(rows.length / 25))}
              </span>
              <div>
                <button
                  className="button secondary"
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="button secondary"
                  disabled={(page + 1) * 25 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <section className="section paper-panel">
        <div className="eyebrow">Method / What this test can establish</div>
        <h2>More fields need stronger evidence.</h2>
        <p>
          The score-only correction and efficiency correction use ridge
          regression with penalty {summary.spec.ridge_penalty}, a free
          intercept, and means and standard deviations learned only from 2023.
          Both predict the original weekly model’s margin error. The efficiency
          model adds four home-minus-away gaps: offensive EPA, EPA allowed,
          offensive yards and yards allowed, all per play.
        </p>
        <p>
          Each weekly input pools paired, scored FBS-versus-FBS games from the
          current and preceding season whose kickoff is before Sunday 00:00 UTC,
          24 hours before the Monday bucket. Prior-season totals receive weight{" "}
          {summary.spec.prior_season_weight}. Each team rate is shrunk toward
          that cutoff’s pooled league rate with {summary.spec.shrinkage_plays}{" "}
          equivalent plays. A team with no usable history receives the league
          rate. {summary.coverage.missing_history_games} of the test games
          needed that fallback.
        </p>
        <p>
          The feature archive contains{" "}
          {summary.coverage.paired_advanced_games.toLocaleString()} paired
          advanced games and {summary.coverage.feature_states} dated states.
          Missing or incomplete advanced pairs do not enter those rate pools.
          The score fits still use their full eligible score samples. The 2025
          evaluation retains the original weekly benchmark’s{" "}
          {summary.cohort.compared_games} games and its{" "}
          {summary.cohort.outside_field} exclusions for teams outside the frozen
          field.
        </p>
        <p>
          Single-season residual training, unadjusted efficiency inputs,
          repeated teams, later source corrections and an already-observed
          historical test season limit this result. The 5,000-resample
          week-block interval retains whole weeks and recomputes game-weighted
          error; teams recur across weeks, so it does not remove all dependence.
          No live betting advantage or new production model is claimed.
        </p>
        <details>
          <summary>Inspect fitted correction coefficients</summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model term</th>
                  <th>Score-only correction</th>
                  <th>Score + efficiency</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Intercept</th>
                  <td>{fmt(summary.models.control.coefficients[0], 4)}</td>
                  <td>{fmt(summary.models.efficiency.coefficients[0], 4)}</td>
                </tr>
                {featureLabels.map((label, i) => (
                  <tr key={label}>
                    <th>
                      {label}
                      <small>Points per training standard deviation</small>
                    </th>
                    <td>
                      {i === 0
                        ? fmt(summary.models.control.coefficients[1], 4)
                        : "Not included"}
                    </td>
                    <td>
                      {fmt(summary.models.efficiency.coefficients[i + 1], 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <div className="hero-actions">
          <Link className="hero-link" href="/football/matchups/">
            Current football forecasts →
          </Link>
          <a
            className="hero-link"
            href="https://scikit-learn.org/stable/modules/cross_validation.html#time-series-split"
          >
            Temporal evaluation guidance ↗
          </a>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Reproduce / Inspect the evidence</div>
            <h2>Every transformation has a trail.</h2>
          </div>
        </div>
        <div className="feature-downloads">
          {[
            ["summary.json", "Design, models & results"],
            [
              "games.json",
              `${summary.coverage.evaluation_games} paired test forecasts`,
            ],
            ["training.json", "2023 training rows & fits"],
            ["calibration.json", "2024 calibration inputs"],
            [
              "feature-states.json",
              `${summary.coverage.feature_states} dated feature states`,
            ],
            ["advanced-inputs.json", "Paired source feature inputs"],
            ["manifest.json", "Artifact hashes"],
          ].map(([file, label]) => (
            <a key={file} href={"/data/football/features/" + file}>
              {label} ↗
            </a>
          ))}
        </div>
        <p className="note source-hash">
          Experiment {summary.id}
          <br />
          Design recorded {summary.spec.recorded_at}. Generated{" "}
          {summary.generated_at}. Both clocks are after the historical
          evaluation season.
        </p>
        <details>
          <summary>Advanced source receipts</summary>
          {summary.sources.map((s) => (
            <p key={s.season}>
              <a className="hero-link" href={s.url}>
                SportsDataverse · {s.dataset} / {s.season} ↗
              </a>
              <br />
              <small>Retrieved {s.fetched_at}</small>
              <br />
              <small className="source-hash">SHA-256 {s.sha256}</small>
            </p>
          ))}
          <p className="note">
            Publisher-stated CC BY 4.0. Silvermine normalizes the source fields,
            builds lagged features and fits independent correction models. Raw
            team-game records are also available in the efficiency desk;
            schedule and score-model evidence are retained in the original
            weekly experiment.
          </p>
        </details>
      </section>
    </>
  );
}
