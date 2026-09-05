import { getBasketball } from "../../_lib/basketball-data";
import { date, fmt } from "../../_lib/format";
export const metadata = {
  title: "Basketball model evaluation and data provenance",
};
export default function Page() {
  const d = getBasketball(),
    e = d.model.evaluation,
    c = d.model.calibration;
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The basketball model notebook</div>
        <h1>
          Make the forecast
          <br />
          earn your trust.
        </h1>
        <p>
          Model {d.model.version}. Edition {date(d.generated_at)}. The model
          separates historical fitting, probability calibration and
          out-of-sample evaluation before generating the 2026–27 slate.
        </p>
      </div>
      <div className="two-col">
        <section className="paper-panel">
          <h2>How a score becomes efficiency.</h2>
          <p>
            Each game’s estimated possessions are the average of the two teams’
            FGA + 0.475 × FTA − offensive rebounds + turnovers. Points divided
            by possessions become points per 100 possessions. Overtime is
            accounted for when converting pace to possessions per 40 minutes.
          </p>
          <p>
            A ridge regression learns separate team offensive and defensive
            effects and a home-floor term. A second regression estimates pace
            from both teams. Penalties are fixed at 12 for efficiency and 8 for
            pace, with older seasons weighted by 0.6 per year. Programs need ten
            observed games in the latest fitting season to enter the rated
            field.
          </p>
          <p>
            Adjusted net efficiency is adjusted offense minus adjusted defense.
            Lower defensive efficiency means fewer points allowed. Schedule
            strength averages rated opponents’ net efficiency; the table reports
            how many opponents were included.
          </p>
          <p>
            Production fit: {d.model.training_games.toLocaleString()} games from{" "}
            {d.model.training_seasons.join(", ")}. No recruiting, roster, injury
            or weather variables enter this version.
          </p>
        </section>
        <section className="paper-panel">
          <h2>Three separate time windows.</h2>
          <div className="rule-list">
            <div>
              <span>Initial efficiency fitting</span>
              <strong>2023–24</strong>
            </div>
            <div>
              <span>Probability / range calibration</span>
              <strong>2024–25</strong>
            </div>
            <div>
              <span>Untouched evaluation</span>
              <strong>2025–26</strong>
            </div>
          </div>
          <p>
            For calibration, the initial model predicts{" "}
            {c.games.toLocaleString()} games from the next season. A
            two-parameter logistic regression maps margins to home win
            probability. The 80th percentile of absolute calibration errors
            gives the symmetric interval half-width: {fmt(c.margin_half_width)}{" "}
            points.
          </p>
          <p>
            For evaluation, efficiency coefficients are refitted using 2023–24
            and 2024–25, then tested on 2025–26. Calibration parameters stay
            fixed. Only after evaluation are production coefficients fitted on
            all three seasons.
          </p>
        </section>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">The independent scorecard</div>
            <h2>What happened in the test.</h2>
          </div>
        </div>
        <div className="strip" style={{ borderTop: "1px solid var(--ink)" }}>
          <div>
            <strong>{e.games.toLocaleString()}</strong>
            <span>Evaluated games</span>
          </div>
          <div>
            <strong>{fmt(e.winner_accuracy * 100)}%</strong>
            <span>Winner accuracy</span>
          </div>
          <div>
            <strong>{fmt(e.margin_mae, 2)}</strong>
            <span>Margin MAE · points</span>
          </div>
          <div>
            <strong>{fmt(e.interval_coverage * 100)}%</strong>
            <span>Observed coverage of nominal 80% range</span>
          </div>
        </div>
        <div className="paper-panel" style={{ marginTop: 22 }}>
          <div className="rule-list">
            <div>
              <span>Margin RMSE</span>
              <strong>{fmt(e.margin_rmse, 2)}</strong>
            </div>
            <div>
              <span>Total-score MAE</span>
              <strong>{fmt(e.total_mae, 2)}</strong>
            </div>
            <div>
              <span>Brier score (lower is better)</span>
              <strong>{fmt(e.brier, 4)}</strong>
            </div>
            <div>
              <span>Log loss (lower is better)</span>
              <strong>{fmt(e.log_loss, 4)}</strong>
            </div>
            <div>
              <span>Constant home-margin baseline MAE</span>
              <strong>{fmt(e.baseline_margin_mae, 2)}</strong>
            </div>
            <div>
              <span>Paired-box test games outside trained field</span>
              <strong>{e.unscored_games}</strong>
            </div>
          </div>
          <p>
            These are retrospective preseason predictions using source records
            as currently published. They do not prove an edge over sportsbooks.
            Final-score evaluation includes overtime, while predictions use
            regulation pace.
          </p>
        </div>
      </section>
      <section className="section two-col">
        <div className="paper-panel">
          <h2>Limits worth keeping visible.</h2>
          {d.model.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p>
            Current roster listings can be carried forward or incomplete. The
            2026–27 board makes no claim to verified transfer status or
            eligibility. Historical program changes are based on actual recorded
            appearances.
          </p>
        </div>
        <div className="paper-panel">
          <h2>Coverage and identity.</h2>
          <div className="rule-list">
            <div>
              <span>Schedule records / 2024–27</span>
              <strong>{d.coverage.schedule_records.toLocaleString()}</strong>
            </div>
            <div>
              <span>Usable paired box-score games</span>
              <strong>{d.coverage.paired_box_games.toLocaleString()}</strong>
            </div>
            <div>
              <span>Unusable completed games</span>
              <strong>{d.coverage.unusable_completed_games}</strong>
            </div>
            <div>
              <span>Player game records / 2025–26</span>
              <strong>{d.coverage.player_box_rows.toLocaleString()}</strong>
            </div>
            <div>
              <span>Rows held apart for missing player IDs</span>
              <strong>{d.coverage.unresolved_rows}</strong>
            </div>
          </div>
          <p>
            The player index aggregates games with recorded minutes. DNP records
            remain in game logs. Raw season statistics are available in player
            profiles. NCAA RAPM identities remain separate from ESPN player IDs;
            no name-only match is treated as verified.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Receipts, not mystery numbers</div>
            <h2>Source provenance.</h2>
          </div>
        </div>
        <p className="note">
          Bulk releases from{" "}
          <a href="https://github.com/sportsdataverse/sportsdataverse-data">
            SportsDataverse
          </a>
          , whose README identifies CC BY 4.0 dataset licensing. We normalize
          source records and compute independent metrics. Direct ESPN and NCAA
          scraping remains disabled or subject to robots policy.
          Source-published RAPM is attributed to SportsDataverse.
        </p>
        <div className="table-scroll" style={{ marginTop: 20 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Season</th>
                <th>Retrieved</th>
                <th>SHA-256 prefix</th>
                <th>Source</th>
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
                    <a href={s.url}>Download ↗</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Model ID: {d.model.id}
          <br />
          Cutoff: {d.model.cutoff}
        </p>
      </section>
    </>
  );
}
