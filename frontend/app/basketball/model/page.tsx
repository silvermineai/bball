import { getBasketball, getRecruiting, getRosterModel, getRosters } from "../../_lib/basketball-data";
import { date, fmt } from "../../_lib/format";
import Link from "next/link";
export const metadata = {
  title: "Basketball model evaluation and data provenance",
};
export default function Page() {
  const d = getBasketball(),
    e = d.model.evaluation,
    c = d.model.calibration,
    rosterModel = getRosterModel(),
    roster = getRosters(),
    recruiting = getRecruiting(),
    rosterSummary = roster.team_summaries ?? [],
    priorMinutes = rosterSummary.reduce((sum, row) => sum + row.prior_minutes, 0),
    representedMinutes = rosterSummary.reduce(
      (sum, row) => sum + row.represented_prior_minutes,
      0,
    ),
    scenarioTeams = rosterModel.teams
      .filter((team) => team.predicted_net != null)
      .sort((a, b) => (b.predicted_net ?? -Infinity) - (a.predicted_net ?? -Infinity))
      .slice(0, 20);
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
      <p className="note" style={{ marginBottom: 28 }}>
        <Link href="/basketball/evaluation/">
          Inspect the weekly updating challenger →
        </Link>{" "}
        Compare both methods on the same historical games, explore calibration
        and download each prediction’s training evidence. The experiment remains
        separate from live preseason forecasts.
      </p>
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
            Luck is a companion diagnostic: actual wins minus the model’s
            expected wins for each paired 2025–26 game, shown in percentage
            points. It helps separate close-game variance from the efficiency
            profile and is not used to alter the 2026–27 forecast.
          </p>
          <p>
            Matchup cards pair each forecast with opponent-adjusted four-factor
            edges from the latest completed season: effective shooting,
            turnover pressure, offensive rebounding and free-throw rate. Those
            edges explain the matchup context; they are descriptive inputs
            alongside the score forecast, not extra roster or injury claims.
          </p>
          <p>
            Production fit: {d.model.training_games.toLocaleString()} games from{" "}
            {d.model.training_seasons.join(", ")}. No recruiting, roster, injury
            or weather variables enter the primary model. Scheduled games with
            an unmodeled program receive a separate cold-start estimate using
            latest-season priors shrunk toward the league mean; its held-out
            interval is wider and it is never registered in the ledger.
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
            <div className="eyebrow">Research challenger / roster continuity</div>
            <h2>Ask what the source-listed roster changes.</h2>
          </div>
          <Link href="/basketball/roster-lab/">Open roster lab →</Link>
        </div>
        <p className="note">
          This separate ridge model learns next-season team net efficiency from
          prior net efficiency, exact-athlete-ID returning and represented
          minutes, incoming workload, listed-player count and minutes-weighted
          publisher Box BPM when the exact source IDs have coverage. It
          produces a margin scenario on the slate; it does not replace the
          primary model, change win probabilities or enter the forecast ledger.
        </p>
        <div className="strip" style={{ borderTop: "1px solid var(--ink)" }}>
          <div><strong>{rosterModel.evaluation.teams.toLocaleString()}</strong><span>Held-out team transitions</span></div>
          <div><strong>{fmt(rosterModel.evaluation.mae, 2)}</strong><span>Challenger MAE · net points</span></div>
          <div><strong>{fmt(rosterModel.evaluation.baseline_mae, 2)}</strong><span>Prior-net baseline MAE</span></div>
          <div><strong>{rosterModel.coverage.scenario_games.toLocaleString()}</strong><span>2026–27 scenario games</span></div>
        </div>
        <div className="paper-panel" style={{ marginTop: 22 }}>
          <p>
            Held-out transition {rosterModel.evaluation.held_out_transition} improved on the prior-net baseline by {fmt(rosterModel.evaluation.improvement_vs_prior_net, 2)} points per 100 possessions in this edition. The result is one chronological season comparison, not a guarantee of future accuracy.
          </p>
          {rosterModel.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
        </div>
        <div className="paper-panel" style={{ marginTop: 22 }}>
          <div className="section-heading" style={{ marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Scenario output / top 20</div>
              <h3>Where the roster inputs point.</h3>
            </div>
            <Link href="/basketball/roster-lab/">Inspect all programs →</Link>
          </div>
          <p className="note">
            Sorted by the challenger&apos;s predicted net efficiency after the
            listed-roster inputs. This is a research scenario, not a national
            ranking, a depth chart or an availability claim. BPM is shown only
            when the source athlete IDs have an attributed publisher value.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Program</th>
                  <th className="numeric">Prior net</th>
                  <th className="numeric">Scenario net</th>
                  <th className="numeric">Change</th>
                  <th className="numeric">Represented BPM</th>
                  <th className="numeric">Listed</th>
                </tr>
              </thead>
              <tbody>
                {scenarioTeams.map((team, index) => {
                  const change = team.prior_net == null || team.predicted_net == null
                    ? null
                    : team.predicted_net - team.prior_net;
                  return (
                    <tr key={team.team_id}>
                      <td className="rank-number">{index + 1}</td>
                      <th scope="row">
                        <Link href={`/basketball/programs/${encodeURIComponent(team.team_id)}/`}>
                          {team.team}
                        </Link>
                        <small>{team.returning_players} returning · {team.represented_players} represented</small>
                      </th>
                      <td className="numeric">{fmt(team.prior_net, 1)}</td>
                      <td className="numeric"><strong>{fmt(team.predicted_net, 1)}</strong></td>
                      <td className="numeric">{fmt(change, 1)}</td>
                      <td className="numeric">{fmt(team.represented_bpm, 1)}</td>
                      <td className="numeric">{team.listed_players}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">The evidence boundary / 2026–27</div>
            <h2>Know what the model can see.</h2>
          </div>
          <Link href="/basketball/recruiting/">Open the evidence ledger →</Link>
        </div>
        <p className="note">
          These are dated source observations carried alongside the forecast.
          They are not hidden model inputs, a transfer clearinghouse or a depth
          chart. The primary forecast remains reproducible from the historical
          game data described above.
        </p>
        <div className="strip" style={{ borderTop: "1px solid var(--ink)" }}>
          <div>
            <strong>{roster.teams_observed.toLocaleString()}</strong>
            <span>Programs with a listed roster</span>
          </div>
          <div>
            <strong>{roster.players_observed.toLocaleString()}</strong>
            <span>Source-listed players</span>
          </div>
          <div>
            <strong>
              {priorMinutes > 0
                ? `${((representedMinutes / priorMinutes) * 100).toFixed(1)}%`
                : "—"}
            </strong>
            <span>Prior minutes represented</span>
          </div>
          <div>
            <strong>{recruiting.coverage.historical_links.toLocaleString()}</strong>
            <span>Recruiting profiles linked to prior stats</span>
          </div>
        </div>
        <div className="paper-panel" style={{ marginTop: 22 }}>
          <div className="rule-list">
            <div>
              <span>Roster observation edition</span>
              <strong>{roster.season}–{String(roster.season + 1).slice(-2)}</strong>
            </div>
            <div>
              <span>Recruiting review scope</span>
              <strong>{recruiting.coverage.programs} programs · {recruiting.coverage.sources} sources</strong>
            </div>
            <div>
              <span>Dated recruiting events</span>
              <strong>{recruiting.coverage.events.toLocaleString()}</strong>
            </div>
            <div>
              <span>National recruiting coverage</span>
              <strong>{recruiting.coverage.complete_national_coverage ? "Complete" : "Partial"}</strong>
            </div>
          </div>
          <p>
            Roster continuity uses publisher athlete IDs and prior recorded
            minutes. An absent source row is not treated as a departure, and a
            recruiting announcement is not treated as eligibility. Use these
            counts to decide where staff verification is still needed before
            turning historical production into a lineup assumption.
          </p>
        </div>
      </section>
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
          <p className="note">
            The model notebook currently has {d.model.calibration.fallback_games?.toLocaleString() ?? "—"} held-out cold-start games for interval calibration; the public slate reports {d.coverage.baseline_estimate_games?.toLocaleString() ?? 0} exploratory estimates alongside {d.coverage.forecast_games.toLocaleString()} primary forecasts.
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
