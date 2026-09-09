import Link from "next/link";
import { getFootballEfficiencyModel, getOverview } from "../../_lib/data";
import { date, fmt } from "../../_lib/format";
export const metadata = {
  title: "Model methodology, data coverage and provenance",
};
export default function Page() {
  const d = getOverview(),
    e = d.model.evaluation,
    c = d.model.calibration,
    efficiency = getFootballEfficiencyModel();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Open notebook / Model {d.model.version}</div>
        <h1>
          Trust starts with
          <br />
          showing the work.
        </h1>
        <p>
          Forecasts are estimates. Every number below describes this published
          data edition, generated {date(d.generated_at)}. We report unavailable
          coverage alongside the results.
        </p>
      </div>
      <p className="note">
        <Link href="/football/evaluation/">
          Does weekly updating improve the model? Inspect the historical
          experiment →
        </Link>
      </p>
      <div className="two-col">
        <section className="paper-panel">
          <h2>What the model learns.</h2>
          <p>
            Two ridge regressions predict home scoring margin and combined
            points from team identities and home field. Team coefficients are
            penalized to reduce overfitting; recent seasons receive more weight
            (0.65 per year). Games on neutral fields have no home-field feature.
          </p>
          <p>
            Training uses {d.model.training_games.toLocaleString()} completed
            FBS-vs-FBS games across {d.model.training_seasons.join(", ")} whose
            kickoff precedes the cutoff. Final scores missing from the source
            are excluded. Known teams receive forecasts; unfamiliar or non-FBS
            opponents do not.
          </p>
          <p>
            Cutoff: <span className="mono">{d.model.cutoff}</span>
            <br />
            Model ID: <span className="mono">{d.model.id}</span>
          </p>
          <p>
            Home win estimates use a logistic curve fitted to {c.season} game
            outcomes. A separate model trained on{" "}
            {c.training_seasons.join(", ")} produced those calibration
            forecasts. The symmetric 80% margin range uses the 80th percentile
            of their absolute errors: ±{fmt(c.margin_half_width, 2)} points.
            Both the probability mapping and range width were frozen before the{" "}
            {e.season} test.
          </p>
        </section>
        <section className="paper-panel">
          <h2>The independent test.</h2>
          <p>
            For the {e.season} test, coefficients were fitted only on{" "}
            {e.training_seasons.join(", ")}. The test uses a fixed preseason
            model for the whole season, with no test-year results fed back into
            team ratings.
          </p>
          <div className="rule-list">
            <div>
              <span>Holdout games</span>
              <strong>{e.games}</strong>
            </div>
            <div>
              <span>Unseen-team games excluded</span>
              <strong>{e.unscored_games}</strong>
            </div>
            <div>
              <span>Probability-pick accuracy</span>
              <strong>{fmt(e.winner_accuracy * 100)}%</strong>
            </div>
            <div>
              <span>Margin-pick accuracy</span>
              <strong>{fmt(e.margin_pick_accuracy * 100)}%</strong>
            </div>
            <div>
              <span>Brier score / lower is better</span>
              <strong>{fmt(e.brier, 4)}</strong>
            </div>
            <div>
              <span>Log loss / lower is better</span>
              <strong>{fmt(e.log_loss, 4)}</strong>
            </div>
            <div>
              <span>Observed coverage / nominal 80% range</span>
              <strong>{fmt(e.interval_coverage * 100)}%</strong>
            </div>
            <div>
              <span>Margin MAE</span>
              <strong>{fmt(e.margin_mae, 2)} pts</strong>
            </div>
            <div>
              <span>Margin RMSE</span>
              <strong>{fmt(e.margin_rmse, 2)} pts</strong>
            </div>
            <div>
              <span>Total MAE</span>
              <strong>{fmt(e.total_mae, 2)} pts</strong>
            </div>
            <div>
              <span>Constant-margin baseline MAE</span>
              <strong>{fmt(e.baseline_margin_mae, 2)} pts</strong>
            </div>
          </div>
          <p>
            The baseline always predicts the training set’s average home margin.
            This comparison measures improvement over a simple baseline; it does
            not demonstrate an advantage over sportsbooks. Probability picks
            select the home team at 50% or higher; margin picks select it above
            zero points. Calibration can change the winner pick near an even
            matchup. Binary metrics exclude tied finals ({e.binary_games} games
            scored); range coverage uses all {e.games} test games and the
            displayed, rounded interval endpoints.
          </p>
        </section>
      </div>
      <section className="section paper-panel">
        <div className="eyebrow">
          Three windows / no test-season recalibration
        </div>
        <h2>Learn. Calibrate. Test.</h2>
        <div className="evaluation-timeline">
          <div>
            <span>01 / Initial fit</span>
            <h3>{c.training_seasons.join("–")}</h3>
            <p>
              Learn score coefficients from completed games before the
              calibration season.
            </p>
          </div>
          <div>
            <span>02 / Calibration</span>
            <h3>{c.season}</h3>
            <p>
              {c.games} forecasts set the probability curve and range width.{" "}
              {c.unscored_games} unseen-team games excluded.
            </p>
          </div>
          <div>
            <span>03 / Holdout</span>
            <h3>{e.season}</h3>
            <p>
              Refit scores on {e.training_seasons.join(", ")}; keep calibration
              frozen. Evaluate {e.games} later games.
            </p>
          </div>
        </div>
        <p>
          The production score fit includes eligible completed games through its
          current cutoff. These results describe a retrospective preseason test,
          using source data that may contain later corrections. They do not
          measure the performance of forecasts published before those games.
        </p>
        <p>
          <a href="/data/football/validation.json" download>
            Download calibration and test evidence ↗
          </a>{" "}
          includes every scored game, excluded game IDs, training IDs, fitted
          coefficients, source receipts and the model implementation hash.
        </p>
        <p>
          Earlier v1 forecasts remain in the{" "}
          <a href="/research/">research ledger</a>. Publishing v2 does not
          replace a game’s earliest eligible registration.
        </p>
      </section>
      <section className="section paper-panel">
        <div className="eyebrow">Research challenger / dated transitions</div>
        <h2>Does the efficiency correction travel?</h2>
        <p>
          This independent experiment adds lagged EPA per play and yards per
          play to the published score-only margin. Each test season is scored
          by a correction fitted only on earlier transition seasons. It remains
          a research comparison: the primary forecast, probability, interval
          and ledger are unchanged.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <caption className="note">
              Lower MAE is better; positive improvement means the challenger
              reduced absolute margin error.
            </caption>
            <thead>
              <tr>
                <th>Test season</th>
                <th>Training transitions</th>
                <th>Games</th>
                <th className="numeric">Primary MAE</th>
                <th className="numeric">Challenger MAE</th>
                <th className="numeric">Improvement</th>
              </tr>
            </thead>
            <tbody>
              {(efficiency.transition_evaluations ?? []).map((transition) => (
                <tr key={transition.test_season}>
                  <td>{transition.test_season}</td>
                  <td>{transition.training_seasons.join(", ")}</td>
                  <td>{transition.rows.toLocaleString()}</td>
                  <td className="numeric">{fmt(transition.baseline_mae, 2)}</td>
                  <td className="numeric">{fmt(transition.challenger_mae, 2)}</td>
                  <td className="numeric">
                    {transition.improvement_vs_primary == null
                      ? "—"
                      : `${transition.improvement_vs_primary > 0 ? "+" : ""}${fmt(transition.improvement_vs_primary, 2)} pts`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          The current production scenario uses all eligible historical
          transition rows through {efficiency.target_season - 1}. Sparse or
          unknown teams shrink toward the league prior; no injuries, roster
          moves, weather or market prices enter this challenger.
        </p>
      </section>
      <section className="section two-col">
        <div className="paper-panel" style={{ minWidth: 0 }}>
          <div className="eyebrow">Probability check / {e.season}</div>
          <h2>Does 70% behave like 70%?</h2>
          <p>
            Each point groups home win estimates into a ten-percentage-point
            band. The diagonal marks agreement between average forecasts and
            observed home wins. Small groups offer limited evidence; counts
            appear alongside every band. Empty bands remain unavailable.
          </p>
          <svg
            viewBox="0 0 400 330"
            role="img"
            aria-labelledby="football-reliability-title football-reliability-desc"
            style={{ width: "100%", maxWidth: 540 }}
          >
            <title id="football-reliability-title">
              Football holdout reliability chart
            </title>
            <desc id="football-reliability-desc">
              Average predicted home win probability on the horizontal axis and
              observed home win rate on the vertical axis. Exact values and
              sample counts follow in the table.
            </desc>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line
                  x1="48"
                  x2="360"
                  y1={275 - t * 240}
                  y2={275 - t * 240}
                  stroke="var(--line)"
                />
                <text
                  x="39"
                  y={279 - t * 240}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize="11"
                >
                  {t * 100}%
                </text>
                <text
                  x={48 + t * 312}
                  y="296"
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize="11"
                >
                  {t * 100}%
                </text>
              </g>
            ))}
            <line
              x1="48"
              y1="275"
              x2="360"
              y2="35"
              stroke="var(--muted)"
              strokeDasharray="4 5"
            />
            {e.reliability
              .filter((b) => b.games > 0)
              .map((b) => (
                <circle
                  key={b.lower}
                  cx={48 + b.predicted! * 312}
                  cy={275 - b.observed! * 240}
                  r={5 + Math.sqrt(b.games) / 3}
                  fill="var(--ink)"
                  stroke="var(--paper)"
                  strokeWidth="2"
                >
                  <title>{`${b.lower * 100}–${b.upper * 100}%: ${b.games} games, predicted ${fmt(b.predicted! * 100)}%, observed ${fmt(b.observed! * 100)}%`}</title>
                </circle>
              ))}
            <text x="48" y="18" fill="var(--muted)" fontSize="11">
              Observed home wins
            </text>
            <text
              x="204"
              y="320"
              textAnchor="middle"
              fill="var(--muted)"
              fontSize="11"
            >
              Average predicted home win probability
            </text>
          </svg>
          <p className="note">
            Brier score averages squared probability error; log loss penalizes
            confident misses more heavily. Both measure overall probabilistic
            performance, not calibration alone. Prior-season calibration does
            not guarantee future accuracy.
          </p>
        </div>
        <div className="paper-panel" style={{ minWidth: 0 }}>
          <h3>The numbers behind the curve</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="note">
                {e.binary_games} test games. Bands include their lower edge; the
                final band includes 100%.
              </caption>
              <thead>
                <tr>
                  <th>Home win band</th>
                  <th>Games</th>
                  <th>Predicted</th>
                  <th>Observed</th>
                </tr>
              </thead>
              <tbody>
                {e.reliability.map((b) => (
                  <tr key={b.lower}>
                    <td>
                      {b.lower * 100}–{b.upper * 100}%
                    </td>
                    <td>{b.games}</td>
                    <td>
                      {b.predicted === null
                        ? "—"
                        : `${fmt(b.predicted * 100)}%`}
                    </td>
                    <td>
                      {b.observed === null ? "—" : `${fmt(b.observed * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Coverage audit</div>
            <h2>Collected. Missing. Uncertain.</h2>
          </div>
        </div>
        <div className="two-col">
          <div className="paper-panel">
            <h3>The data we have</h3>
            <div className="rule-list">
              <div>
                <span>Schedule records / all imported divisions</span>
                <strong>{d.coverage.games.toLocaleString()}</strong>
              </div>
              <div>
                <span>Player box-score rows</span>
                <strong>{d.coverage.box_rows.toLocaleString()}</strong>
              </div>
              <div>
                <span>Finals with missing scores</span>
                <strong>{d.coverage.finals_missing_scores}</strong>
              </div>
              <div>
                <span>Archived market records</span>
                <strong>{d.coverage.market_observations}</strong>
              </div>
              <div>
                <span>Verified pregame observations</span>
                <strong>{d.coverage.pregame_market_observations}</strong>
              </div>
            </div>
            <p>
              Box-score coverage is not a complete roster census. Some source
              columns remain generically named; those fields are preserved
              without guessed labels. Defensive and specialist records without
              stable player IDs are retained separately and are not joined by
              name alone.
            </p>
          </div>
          <div className="paper-panel">
            <h3>What is not in the model</h3>
            {d.model.limitations.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>
              The independent 2026–27 basketball efficiency model is available
              in the basketball model notebook. Dated school recruiting
              announcements and historical program changes are available as
              separate evidence; they are not football model inputs.
            </p>
          </div>
        </div>
      </section>
      <section className="section paper-panel">
        <h2>Markets need a clock.</h2>
        <p>
          Imported lines are archival references. The archive does not provide a
          verified bookmaker timestamp or distinguish a closing quote. An
          observation made after kickoff never enters a pregame comparison.
          Historical forecasts and line observations are retained in D1 so
          future evaluation can use what was actually available before each
          game.
        </p>
        <p>
          Home spread uses sportsbook convention: a negative number means the
          home team is favored. The model’s home margin uses the opposite
          convention: positive means a home win. Their difference is model home
          margin + market home spread. This is a disagreement in points, not a
          recommendation.
        </p>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Attribution & receipts</div>
            <h2>Follow every number back.</h2>
          </div>
        </div>
        <p className="note">
          Bulk datasets:{" "}
          <a href="https://github.com/sportsdataverse/sportsdataverse-data">
            SportsDataverse
          </a>
          , whose README labels data CC BY 4.0. Original providers include ESPN
          and CollegeFootballData. We normalize rows, derive rankings and train
          our own score model. No direct NCAA or ESPN crawling is enabled in the
          football pipeline. NCAA robots.txt disallows crawling; ESPN terms
          restrict automated extraction. Publisher licenses do not independently
          establish every upstream right.
        </p>
        <div className="table-scroll" style={{ marginTop: 20 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Season</th>
                <th>Retrieved</th>
                <th>SHA-256 prefix</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {d.sources.map((s) => (
                <tr key={`${s.dataset}-${s.season}`}>
                  <td>{s.dataset}</td>
                  <td>{s.season}</td>
                  <td>{date(s.fetched_at)}</td>
                  <td className="mono">{s.sha256.slice(0, 12)}</td>
                  <td>
                    <a href={s.url}>Source download ↗</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
