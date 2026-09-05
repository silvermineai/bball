import { getOverview } from "../../_lib/data";
import { date, fmt } from "../../_lib/format";
export const metadata = {
  title: "Model methodology, data coverage and provenance",
};
export default function Page() {
  const d = getOverview(),
    e = d.model.evaluation;
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
            Home win estimates use a normal-error assumption and the historical
            holdout RMSE. The 80% ranges use ±1.281552 × RMSE. Probabilities and
            interval coverage have not been independently calibrated.
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
              <span>Winner accuracy</span>
              <strong>{fmt(e.winner_accuracy * 100)}%</strong>
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
            not demonstrate an advantage over sportsbooks.
          </p>
        </section>
      </div>
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
              in the basketball model notebook. Confirmed current roster
              transitions and recruiting prospect evaluations remain in
              development.
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
