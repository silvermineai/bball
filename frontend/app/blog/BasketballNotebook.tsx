import Link from "next/link";
import type { BBGame, BBRoster, BBRosters, BBRosterScenario, BBTeam, BBOverview } from "../_lib/basketball-types";
import type { ScoutPlayer } from "../_lib/scouting-types";
import type { ShotOption } from "../_lib/shooting";
import type { ShotSeason } from "../_lib/shooting";
import type { RecruitingRelease } from "../_lib/recruiting";
import { basketballEditorialLens } from "../_lib/basketball-editorial";
import { date, fmt } from "../_lib/format";
import { notebookFormMetrics, type NotebookRecentForm } from "./notebook-form";
import { buildNotebookGameRead } from "./notebook-game-read";
import { notebookModelValidation } from "./notebook-model-validation";
import { notebookRosterRoleContext, summarizeNotebookRoster } from "./notebook-roster";
import { buildNotebookShotPrep } from "./notebook-shot-prep";
import { notebookPersonnelWatch } from "./notebook-personnel-watch";
import { explainBasketballPrediction } from "../_lib/basketball-prediction-explanation";
import { buildNotebookEvidenceRows } from "./notebook-evidence";

/**
 * Keep the forecast identity visible on every notebook. A publication date on
 * its own is not enough to reproduce a matchup after the next model refresh.
 */
export function notebookForecastIdentity(
  modelId: string | null | undefined,
  generatedAt: string | null | undefined,
) {
  return {
    modelId: modelId?.trim() || "unavailable",
    generatedAt: generatedAt || "unavailable",
  };
}

const factorLabels: Record<string, string> = {
  efg: "Shot quality",
  tov: "Ball security",
  orb: "Second chances",
  ftr: "Free-throw pressure",
};

const percent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;

export default function BasketballNotebook({
  game,
  generatedAt,
  modelId,
  homeTeam,
  awayTeam,
  rosterScenario,
  homePlayers = [],
  awayPlayers = [],
  homeRosterPlayers = [],
  awayRosterPlayers = [],
  recentForm,
  rosterSeason,
  rosterSource,
  shotProfiles = [],
  shotSeason,
  shotEdition = null,
  recruiting = null,
  modelEvaluation,
  modelTrainingSeasons,
  model,
}: {
  game: BBGame;
  generatedAt: string;
  modelId?: string | null;
  homeTeam?: BBTeam | null;
  awayTeam?: BBTeam | null;
  rosterScenario?: BBRosterScenario | null;
  homePlayers?: ScoutPlayer[];
  awayPlayers?: ScoutPlayer[];
  homeRosterPlayers?: BBRoster[];
  awayRosterPlayers?: BBRoster[];
  recentForm: NotebookRecentForm | null;
  rosterSeason: number;
  rosterSource: BBRosters["source"];
  shotProfiles?: ShotOption[];
  shotSeason?: number;
  shotEdition?: ShotSeason | null;
  recruiting?: RecruitingRelease | null;
  modelEvaluation?: BBOverview["model"]["evaluation"] | null;
  modelTrainingSeasons?: number[];
  model?: Pick<BBOverview["model"], "teams" | "efficiency" | "tempo"> | null;
}) {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
  const scoreExplanation = explainBasketballPrediction(model, game, prediction);
  const forecastIdentity = notebookForecastIdentity(modelId || game.forecast_model_id, generatedAt);
  const lens = basketballEditorialLens(game);
  const factorRows = Object.entries(game.matchup_factors?.factors || {})
    .filter(([, values]) => values)
    .map(([key, values]) => ({
      key,
      label: factorLabels[key] || key,
      values: values!,
      edge: game.matchup_factors?.edges?.[key as keyof NonNullable<BBGame["matchup_factors"]>["edges"]],
    }));
  const coldStart = !game.prediction && !!game.fallback_prediction;
  const canonicalUrl = `https://bball.silvermine.dev/blog/basketball-game-${game.id}/`;
  const pct = (value: number | null | undefined) =>
    value == null ? "—" : `${fmt(value * 100, 1)}%`;
  const ratingRows = [
    { label: "Adj O", home: homeTeam?.adj_off, away: awayTeam?.adj_off },
    { label: "Adj D", home: homeTeam?.adj_def, away: awayTeam?.adj_def },
    { label: "NET", home: homeTeam?.adj_net, away: awayTeam?.adj_net },
    { label: "PACE", home: homeTeam?.adj_tempo, away: awayTeam?.adj_tempo },
    { label: "SOS", home: homeTeam?.sos, away: awayTeam?.sos },
    { label: "eFG%", home: pct(homeTeam?.efg), away: pct(awayTeam?.efg) },
    { label: "TO%", home: pct(homeTeam?.tov_rate), away: pct(awayTeam?.tov_rate) },
    { label: "ORB%", home: pct(homeTeam?.orb_rate), away: pct(awayTeam?.orb_rate) },
    { label: "FTR", home: pct(homeTeam?.ft_rate), away: pct(awayTeam?.ft_rate) },
  ];
  const teamContextCount = Number(Boolean(homeTeam)) + Number(Boolean(awayTeam));
  const playerContextCount = Number(awayPlayers.length > 0) + Number(homePlayers.length > 0);
  const rosterListingCount = Number(homeRosterPlayers.length > 0) + Number(awayRosterPlayers.length > 0);
  const rosterTransitionRows = [
    { teamId: game.away_id, teamName: game.away_name, summary: summarizeNotebookRoster(awayRosterPlayers) },
    { teamId: game.home_id, teamName: game.home_name, summary: summarizeNotebookRoster(homeRosterPlayers) },
  ];
  const rosterRoleContexts = [
    { teamId: game.away_id, teamName: game.away_name, context: notebookRosterRoleContext(awayRosterPlayers, game.away_id, rosterSeason, rosterSource) },
    { teamId: game.home_id, teamName: game.home_name, context: notebookRosterRoleContext(homeRosterPlayers, game.home_id, rosterSeason, rosterSource) },
  ];
  const rosterRolesReady = rosterRoleContexts.every((row) => row.context != null);
  const shotPrepRows = shotSeason == null ? [] : [
    {
      teamId: game.away_id,
      teamName: game.away_name,
      rows: buildNotebookShotPrep(game.away_id, awayPlayers, shotProfiles, shotSeason),
    },
    {
      teamId: game.home_id,
      teamName: game.home_name,
      rows: buildNotebookShotPrep(game.home_id, homePlayers, shotProfiles, shotSeason),
    },
  ];
  const shotPrepCount = shotPrepRows.reduce((sum, group) => sum + group.rows.length, 0);
  const personnelWatchRows = [
    { teamName: game.away_name, rows: notebookPersonnelWatch(awayPlayers) },
    { teamName: game.home_name, rows: notebookPersonnelWatch(homePlayers) },
  ];
  const shotEvidence = shotPrepRows.flatMap((group) => group.rows).reduce(
    (totals, row) => ({
      attempts: totals.attempts + (row.profile.matched.attempts ?? 0),
      located: totals.located + (row.profile.matched.located ?? 0),
    }),
    { attempts: 0, located: 0 },
  );
  const evidenceRows = buildNotebookEvidenceRows({
    homeId: game.home_id,
    awayId: game.away_id,
    forecastModelId: forecastIdentity.modelId,
    forecastCapturedAt: forecastIdentity.generatedAt,
    recentForm,
    historicalPlayerCount: homePlayers.length + awayPlayers.length,
    shotEdition,
    shotPlayerJoins: shotPrepCount,
    shotAttempts: shotEvidence.attempts,
    shotLocated: shotEvidence.located,
    recruiting,
    rosterSource,
    rosterSeason,
    rosterRows: homeRosterPlayers.length + awayRosterPlayers.length,
  });
  const gameRead = buildNotebookGameRead(
    game,
    homeTeam,
    awayTeam,
    rosterScenario,
    forecastIdentity.modelId,
  );
  const validation = notebookModelValidation(modelEvaluation, modelTrainingSeasons);
  const formRows = recentForm ? [
    { team: recentForm.away, sample: "Season", values: recentForm.away.season },
    { team: recentForm.away, sample: "Last five", values: recentForm.away.lastFive },
    { team: recentForm.home, sample: "Season", values: recentForm.home.season },
    { team: recentForm.home, sample: "Last five", values: recentForm.home.lastFive },
  ] : [];
  const formMetric = (key: keyof NotebookRecentForm["home"]["season"]["metrics"], value: number | null) => {
    if (value == null) return "—";
    const definition = notebookFormMetrics.find((metric) => metric.key === key);
    return definition?.format === "percent" ? `${fmt(value * 100)}%` : fmt(value);
  };
  const record = (sample: NotebookRecentForm["home"]["season"]) =>
    `${sample.wins}-${sample.losses}${sample.ties ? `-${sample.ties}` : ""}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: `${game.away_name} at ${game.home_name}: 2026–27 basketball notebook`,
    description: `Projected score, Four Factors and reporting questions for ${game.away_name} at ${game.home_name}.`,
    datePublished: generatedAt,
    dateModified: generatedAt,
    author: { "@type": "Organization", name: "Silvermine Research" },
    publisher: { "@type": "Organization", name: "Silvermine Research", url: "https://bball.silvermine.dev" },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    isAccessibleForFree: true,
    about: { "@type": "Thing", name: "Men's college basketball" },
  };

  return (
    <article className="article matchup-notebook">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <div className="eyebrow">
        Basketball matchup notebook · {date(generatedAt)} edition
      </div>
      <h1>
        {game.away_name} at {game.home_name}
      </h1>
      <p className="deck">
        A pregame research note built from the stored 2026–27 forecast, its
        stored factors and the questions still waiting for film or roster
        confirmation.
      </p>
      <div className="coverage-readiness" role="status" aria-label="Game analysis coverage">
        <div><strong>{prediction.estimate_type === "cold_start" ? "Cold start" : "Primary"}</strong><span>Forecast estimate</span></div>
        <div><strong>{teamContextCount}/2</strong><span>Team profiles attached</span></div>
        <div><strong>{playerContextCount}/2</strong><span>Historical player groups attached</span></div>
        <div><strong>{rosterScenario ? "Ready" : "—"}</strong><span>Roster continuity scenario</span></div>
        <div><strong>{rosterListingCount}/2</strong><span>Roster listings attached</span></div>
      </div>
      <p className="note notebook-edition" role="status">
        Forecast edition <span className="source-hash">{forecastIdentity.modelId}</span>
        {forecastIdentity.generatedAt === "unavailable"
          ? " · capture clock unavailable"
          : ` · captured ${date(forecastIdentity.generatedAt)}`}
      </p>

      <section className="paper-panel notebook-forecast" aria-label="Stored forecast">
        <div className="eyebrow">The baseline</div>
        <h2>
          {game.away_name} {fmt(prediction.away_score)} · {game.home_name}{" "}
          {fmt(prediction.home_score)}
        </h2>
        <div className="raw-stat-grid">
          <div><dt>Home win estimate</dt><dd>{percent(prediction.home_win_probability)}</dd></div>
          <div><dt>Projected home margin</dt><dd>{prediction.home_margin >= 0 ? "+" : ""}{fmt(prediction.home_margin)}</dd></div>
          <div><dt>80% home-margin range</dt><dd>{fmt(prediction.margin_low)} to {fmt(prediction.margin_high)}</dd></div>
          <div><dt>Estimated possessions</dt><dd>{fmt(prediction.pace)}</dd></div>
        </div>
        <p className="note">
          {coldStart
            ? "Exploratory cold-start estimate: at least one program is outside the trained field, so the wider calibrated range is the primary context."
            : "Primary preseason estimate from the published efficiency model. The range describes held-out model error, not a promise about the final score."}
        </p>
      </section>

      <section className="section" aria-labelledby="notebook-evidence-chain">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Evidence chain / retained releases</div>
            <h2 id="notebook-evidence-chain">What this game read is built from.</h2>
          </div>
          <Link href="/basketball/source-stats/">Open source coverage →</Link>
        </div>
        <p className="note">
          Read the forecast, historical workload, shot map and roster signals in
          separate columns. A model edition identifies the registered estimate;
          a SHA-256 receipt identifies the retained source release. Missing or
          mismatched evidence stays visible as unavailable.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Coverage attached to this game</th>
                <th>Edition / receipt</th>
                <th>Captured / reviewed</th>
                <th>How to learn from it</th>
              </tr>
            </thead>
            <tbody>
              {evidenceRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.label}
                    <small>{row.status === "verified" ? "Verified source release" : row.status === "edition" ? "Registered edition" : "Unavailable"}</small>
                  </th>
                  <td>{row.coverage}</td>
                  <td><span className="source-hash">{row.receipt}</span></td>
                  <td>{row.captured ? date(row.captured) : "—"}</td>
                  <td>{row.learning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          This table documents provenance and joins. It does not turn a source
          listing into an availability decision, and it does not add a second
          forecast to the stored model.
        </p>
      </section>

      {scoreExplanation && (
        <section className="section" aria-labelledby="notebook-score-construction">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Model arithmetic / exact edition</div>
              <h2 id="notebook-score-construction">How the projected score is built.</h2>
            </div>
            <Link href="/basketball/model/">Read the model record →</Link>
          </div>
          <p className="note">
            This table reconstructs the stored ridge model from its published coefficient arrays. Each efficiency term is points per 100 possessions; the final score is efficiency × projected pace ÷ 100. It is an explanation of the estimate, not an additional forecast.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Term</th><th className="numeric">{scoreExplanation.away.team}</th><th className="numeric">{scoreExplanation.home.team}</th></tr></thead>
              <tbody>
                <tr><th scope="row">League baseline</th><td className="numeric">{fmt(scoreExplanation.away.league, 2)}</td><td className="numeric">{fmt(scoreExplanation.home.league, 2)}</td></tr>
                <tr><th scope="row">Own offense effect</th><td className="numeric">{scoreExplanation.away.ownOffense >= 0 ? "+" : ""}{fmt(scoreExplanation.away.ownOffense, 2)}</td><td className="numeric">{scoreExplanation.home.ownOffense >= 0 ? "+" : ""}{fmt(scoreExplanation.home.ownOffense, 2)}</td></tr>
                <tr><th scope="row">Opponent defense effect</th><td className="numeric">{scoreExplanation.away.opponentDefense >= 0 ? "+" : ""}{fmt(scoreExplanation.away.opponentDefense, 2)}</td><td className="numeric">{scoreExplanation.home.opponentDefense >= 0 ? "+" : ""}{fmt(scoreExplanation.home.opponentDefense, 2)}</td></tr>
                <tr><th scope="row">Venue effect</th><td className="numeric">{scoreExplanation.away.venue >= 0 ? "+" : ""}{fmt(scoreExplanation.away.venue, 2)}</td><td className="numeric">{scoreExplanation.home.venue >= 0 ? "+" : ""}{fmt(scoreExplanation.home.venue, 2)}</td></tr>
                <tr><th scope="row"><strong>Projected efficiency</strong></th><td className="numeric"><strong>{fmt(scoreExplanation.away.efficiency, 2)}</strong></td><td className="numeric"><strong>{fmt(scoreExplanation.home.efficiency, 2)}</strong></td></tr>
                <tr><th scope="row">Projected pace</th><td className="numeric">{fmt(scoreExplanation.paceBaseline, 2)}</td><td className="numeric">{fmt(scoreExplanation.paceBaseline, 2)}</td></tr>
                <tr><th scope="row"><strong>Score from equation</strong></th><td className="numeric"><strong>{fmt(scoreExplanation.away.projectedScore, 2)}</strong></td><td className="numeric"><strong>{fmt(scoreExplanation.home.projectedScore, 2)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p className="note">A neutral-site game has zero venue effect. A missing or edition-mismatched coefficient set suppresses this table rather than presenting stale arithmetic.</p>
        </section>
      )}

      <section className="section" aria-labelledby="notebook-model-validation">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Model accountability</div>
            <h2 id="notebook-model-validation">How much has this model missed?</h2>
          </div>
          <Link href="/basketball/model/">Open the full model record →</Link>
        </div>
        <p className="note">
          These held-out results describe the forecast system behind this
          notebook. They are a calibration reference for the range, not a
          guarantee about this game and not evidence of a market edge.
        </p>
        {validation ? <>
          <div className="raw-stat-grid">
            <div><dt>Held-out games</dt><dd>{validation.games.toLocaleString()}</dd></div>
            <div><dt>Margin MAE · test {validation.testSeason}</dt><dd>{fmt(validation.marginMae)} pts</dd></div>
            <div><dt>Winner accuracy</dt><dd>{fmt(validation.winnerAccuracy * 100)}%</dd></div>
            <div><dt>80% range coverage</dt><dd>{fmt(validation.intervalCoverage * 100)}%</dd></div>
          </div>
          <p className="note">
            Training seasons: {validation.trainingSeasons.join(", ")} · constant
            home-margin baseline MAE: {fmt(validation.baselineMarginMae)} pts.
            The test season remains outside model fitting and calibration.
          </p>
        </> : <p className="empty">Held-out model validation is unavailable for this edition.</p>}
      </section>

      {gameRead.length > 0 && (
        <section className="section" aria-labelledby="notebook-game-read">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Four-step game read</div>
              <h2 id="notebook-game-read">Turn the forecast into questions.</h2>
            </div>
            <Link href="/basketball/learn/">Learn the metrics →</Link>
          </div>
          <p className="note">
            Read these in order before opening the deeper tables. Each row is
            arithmetic over the stored forecast, exact team ratings, matchup
            factors or matched roster scenario. It does not add a new model.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Read</th>
                  <th>Finding</th>
                  <th>Stored evidence</th>
                  <th>Question to take to film</th>
                </tr>
              </thead>
              <tbody>
                {gameRead.map((row, index) => (
                  <tr key={row.key}>
                    <th scope="row">
                      <span className="eyebrow">Step {index + 1}</span>
                      {row.label}
                    </th>
                    <td><strong>{row.finding}</strong></td>
                    <td>{row.evidence}</td>
                    <td>{row.question}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Missing rows mean the exact supporting record did not pass the
            notebook’s identity or numeric checks; absence is not scored as a
            neutral signal.
          </p>
        </section>
      )}

      <section className="section" aria-labelledby="notebook-team-snapshot">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Team snapshot</div>
            <h2 id="notebook-team-snapshot">The numbers behind the estimate.</h2>
          </div>
          <Link href="/basketball/ratings/">Open the full ratings table →</Link>
        </div>
        <p className="note">
          Latest completed-season team rates carried into this forecast edition.
          They describe the inputs and context; they are not a claim about a
          current lineup.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Metric</th><th className="numeric">{game.away_name}</th><th className="numeric">{game.home_name}</th></tr></thead>
            <tbody>{ratingRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="numeric">{typeof row.away === "string" ? row.away : fmt(row.away)}</td>
                <td className="numeric">{typeof row.home === "string" ? row.home : fmt(row.home)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {rosterScenario ? (
          <div className="raw-stat-grid">
            <div><dt>Roster-lens margin</dt><dd>{rosterScenario.roster_margin >= 0 ? "+" : ""}{fmt(rosterScenario.roster_margin)} home</dd></div>
            <div><dt>Change vs baseline</dt><dd>{rosterScenario.margin_delta >= 0 ? "+" : ""}{fmt(rosterScenario.margin_delta)} pts</dd></div>
            <div><dt>Scenario home win</dt><dd>{fmt(rosterScenario.roster_home_win_probability * 100)}%</dd></div>
            <div><dt>Scenario margin range</dt><dd>{fmt(rosterScenario.roster_margin_low)} to {fmt(rosterScenario.roster_margin_high)}</dd></div>
            <div><dt>Scenario team net</dt><dd>{fmt(rosterScenario.away_predicted_net)} away · {fmt(rosterScenario.home_predicted_net)} home</dd></div>
          </div>
        ) : (
          <p className="note">No same-edition roster continuity scenario is available for this game.</p>
        )}
      </section>

      <section className="section" aria-labelledby="notebook-recent-form">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Recorded form / exact scouting edition</div>
            <h2 id="notebook-recent-form">What do the last five show?</h2>
          </div>
          <Link href="/basketball/team-stats/">Open team stats →</Link>
        </div>
        <p className="note">
          Season and last-five observations come from the same retained team profiles. They are descriptive samples for film review; they are not a trend claim, a cause, or a replacement for the stored forecast baseline.
        </p>
        {recentForm ? <>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Program / exact ID</th><th>Sample</th><th className="numeric">Record</th><th className="numeric">Pace</th>{notebookFormMetrics.map((metric) => <th className="numeric" key={metric.key}>{metric.label}</th>)}</tr></thead>
              <tbody>{formRows.map(({ team, sample, values }) => <tr key={`${team.id}-${sample}`}>
                <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(team.id)}/`}>{team.name}</Link><small>ID {team.id}</small></th>
                <td>{sample}<small>{values.games} game{values.games === 1 ? "" : "s"}</small></td>
                <td className="numeric">{record(values)}</td>
                <td className="numeric">{fmt(values.pace)}</td>
                {notebookFormMetrics.map((metric) => <td className="numeric" key={metric.key}>{formMetric(metric.key, values.metrics[metric.key])}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            Scouting edition <span className="source-hash">{recentForm.sourceEdition}</span> · model <span className="source-hash">{recentForm.modelId}</span> · captured {date(recentForm.generatedAt)}.
          </p>
        </> : <p className="empty">The two exact-team profiles do not share a valid scouting edition and model identity, so the recent-form comparison is withheld.</p>}
      </section>

      <section className="section" aria-labelledby="notebook-player-snapshot">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Historical player workload</div>
            <h2 id="notebook-player-snapshot">Who carried the old possessions?</h2>
          </div>
          <Link href="/basketball/players/">Open the player table →</Link>
        </div>
        <p className="note">
          The three highest-minute contributors in the latest completed season.
          These rows preserve recorded production for preparation; they are not
          a projected rotation or an availability decision.
        </p>
        <section className="paper-panel" aria-label="Personnel watch signals" style={{ marginBottom: 20 }}>
          <div className="section-heading" style={{ marginBottom: 8 }}>
            <div><div className="eyebrow">Personnel watch / retained player fields</div><h3>What should the staff test first?</h3></div>
            <span className="note">Exact player IDs</span>
          </div>
          <p className="note">These role signals come from the same completed-season player records. Each question is attached to a recorded workload or rate field; missing denominators remain unavailable.</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Program / player</th><th>Recorded role signals</th><th>Film question</th></tr></thead>
              <tbody>{personnelWatchRows.flatMap((group) => group.rows.map((row) => (
                <tr key={`${group.teamName}-${row.player.id}`}>
                  <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(row.player.id)}&season=${row.player.season}`}>{row.player.name}</Link><small>{group.teamName} · {row.player.position || "Position unavailable"}</small></th>
                  <td>{row.signals.length ? row.signals.map((signal) => <span key={signal.label} className="tag" style={{ marginRight: 6 }}>{signal.label} {signal.value}</span>) : <span className="note">No denominator-backed role signal</span>}</td>
                  <td>{row.signals.length ? row.signals[0].question : "Use the workload table and player profile; no additional role question is supported by the retained fields."}</td>
                </tr>
              )))}</tbody>
            </table>
          </div>
        </section>
        <div className="two-col">
          {([
            { teamName: game.away_name, players: awayPlayers },
            { teamName: game.home_name, players: homePlayers },
          ] as Array<{ teamName: string; players: ScoutPlayer[] }>).map(({ teamName, players }) => (
            <section className="paper-panel" key={teamName}>
              <h3>{teamName}</h3>
              {players.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Player</th><th className="numeric">MIN</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">APG</th><th className="numeric">TS%</th></tr></thead>
                    <tbody>{players.map((player) => (
                      <tr key={player.id}>
                        <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=${player.season}`}>{player.name}</Link><small>{player.position || "Position unavailable"}</small></th>
                        <td className="numeric">{fmt(player.minutes, 0)}</td>
                        <td className="numeric">{fmt(player.mpg)}</td>
                        <td className="numeric">{fmt(player.ppg)}</td>
                        <td className="numeric">{fmt(player.apg)}</td>
                        <td className="numeric">{percent(player.ts)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="empty">No qualifying historical player rows are available for this team.</p>}
            </section>
          ))}
        </div>
      </section>

      {shotPrepCount > 0 && (
        <section className="section" aria-labelledby="notebook-shot-prep">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Personnel → shot map / exact player IDs</div>
              <h2 id="notebook-shot-prep">Turn the factor edge into a film drill.</h2>
            </div>
            <Link href="/basketball/shooting/">Open the full shooting lab →</Link>
          </div>
          <p className="note">
            These links join the historical workload table to the retained NCAA
            coordinate archive by exact player and team ID. The questions use
            recorded attempt denominators to choose film; they do not predict a
            current rotation or treat an archived shot map as availability.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Program / player</th><th>Recorded shot evidence</th><th>Preparation question</th><th>Drill-down</th></tr></thead>
              <tbody>{shotPrepRows.flatMap((group) => group.rows.map((row) => (
                <tr key={`${group.teamId}-${row.player.id}`}>
                  <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(row.player.id)}&season=${row.player.season}`}>{row.player.name}</Link><small>{group.teamName} · {row.player.position || "Position unavailable"}</small></th>
                  <td>{row.evidence}<small>{row.profile.name === row.player.name ? "Exact archive name" : `Archive label: ${row.profile.name}`}</small></td>
                  <td>{row.question}</td>
                  <td><Link className="button secondary" href={row.mapHref}>View court map ↗</Link></td>
                </tr>
              )))}</tbody>
            </table>
          </div>
          <p className="note">Located coordinates are a subset of matched attempts; missing locations remain in the attempt denominator and are not imputed.</p>
        </section>
      )}

      <section className="section" aria-labelledby="notebook-roster-snapshot">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Current roster observation</div>
            <h2 id="notebook-roster-snapshot">Who is listed today?</h2>
          </div>
          <Link href="/basketball/ncaa-rosters/">Open the roster archive →</Link>
        </div>
        <p className="note">
          Exact-ID rows from the current roster snapshot, ordered by prior
          recorded minutes. Status is an observed listing label; it does not
          establish eligibility, availability, a commitment or a projected
          rotation.
        </p>
        <div className="table-scroll" style={{ marginBottom: 20 }}>
          <table className="data-table">
            <caption className="eyebrow" style={{ captionSide: "top", textAlign: "left", padding: "0 0 8px" }}>Roster transition view</caption>
            <thead><tr><th>Program</th><th className="numeric">Listed</th><th className="numeric">Same program</th><th className="numeric">Different program</th><th className="numeric">New to dataset</th><th className="numeric">Ambiguous / other</th><th className="numeric">Prior stat profiles</th><th className="numeric">Recorded prior minutes</th></tr></thead>
            <tbody>{rosterTransitionRows.map(({ teamId, teamName, summary }) => <tr key={teamId}>
              <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(teamId)}/`}>{teamName}</Link><small><Link href={`/basketball/recruiting/?view=observations&team=${encodeURIComponent(teamId)}`}>Open exact roster observations →</Link></small></th>
              <td className="numeric"><strong>{summary.listed.toLocaleString()}</strong></td>
              <td className="numeric">{summary.sameProgram.toLocaleString()}</td>
              <td className="numeric">{summary.differentProgram.toLocaleString()}</td>
              <td className="numeric">{summary.newToDataset.toLocaleString()}</td>
              <td className="numeric">{summary.ambiguousOrOther.toLocaleString()}</td>
              <td className="numeric">{summary.priorProfiles.toLocaleString()} / {summary.listed.toLocaleString()}</td>
              <td className="numeric">{summary.priorMinutes.toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>Same-program, different-program and new-to-dataset are exact retained roster observations. Recorded prior minutes sum only valid attached stat profiles; they do not establish current availability, eligibility or role.</p>
        <section className="paper-panel" aria-label="Roster role workload comparison" style={{ marginBottom: 20 }}>
          <div className="section-heading" style={{ marginBottom: 8 }}>
            <div><div className="eyebrow">Role workload / retained roster edition</div><h3>Where is prior experience attached?</h3></div>
            <Link href="/basketball/roster-lab/">Compare every program →</Link>
          </div>
          <p className="note">Source positions group each current listing as guard, forward, center or unreported. Minutes belong to retained prior-season stat profiles and stay separated by same-program, different-program and other observation status. They are context for film review, not a projected rotation.</p>
          {rosterRolesReady ? <>
            <div className="table-scroll" style={{ marginTop: 14 }}><table className="data-table">
              <thead><tr><th>Program</th><th>Source role</th><th className="numeric">Listed</th><th className="numeric">Prior profiles</th><th className="numeric">Prior minutes</th><th className="numeric">Same-program minutes</th><th className="numeric">Different-program minutes</th><th className="numeric">Other-status minutes</th></tr></thead>
              <tbody>{rosterRoleContexts.flatMap(({ teamId, teamName, context }) => context!.roles.map((role) => <tr key={`${teamId}-${role.role}`}>
                <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(teamId)}/`}>{teamName}</Link></th>
                <td>{role.role === "unreported" ? "Unreported" : role.role[0].toUpperCase() + role.role.slice(1)}</td>
                <td className="numeric">{role.listed}</td><td className="numeric">{role.priorProfiles}</td><td className="numeric">{Math.round(role.priorMinutes).toLocaleString()}</td><td className="numeric">{Math.round(role.sameProgramMinutes).toLocaleString()}</td><td className="numeric">{Math.round(role.differentProgramMinutes).toLocaleString()}</td><td className="numeric">{Math.round(role.otherPriorMinutes).toLocaleString()}</td>
              </tr>))}</tbody>
            </table></div>
            <p className="note" style={{ marginTop: 10 }}>Roster season {rosterSeason} · receipt <span className="source-hash">{rosterRoleContexts[0].context!.receipt.sha256}</span>{rosterRoleContexts[0].context!.receipt.fetched_at ? ` · captured ${date(rosterRoleContexts[0].context!.receipt.fetched_at)}` : ""}.</p>
          </> : <p className="empty">The two exact-team roster groups or their release receipt did not pass validation, so the role comparison is withheld.</p>}
        </section>
        <div className="two-col">
          {([
            { teamName: game.away_name, players: awayRosterPlayers },
            { teamName: game.home_name, players: homeRosterPlayers },
          ] as Array<{ teamName: string; players: BBRoster[] }>).map(({ teamName, players }) => (
            <section className="paper-panel" key={teamName}>
              <h3>{teamName}</h3>
              {players.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Player</th><th>Status</th><th className="numeric">MIN</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">TS%</th></tr></thead>
                    <tbody>{players.slice(0, 8).map((player) => {
                      const production = player.prior_production;
                      return <tr key={player.id}>
                        <th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(player.id)}&season=2026`}>{player.name}</Link><small>{player.position || "Position unavailable"}</small></th>
                        <td>{player.status.replaceAll("_", " ")}</td>
                        <td className="numeric">{production ? fmt(production.minutes, 0) : "—"}</td>
                        <td className="numeric">{production ? fmt(production.mpg) : "—"}</td>
                        <td className="numeric">{production ? fmt(production.ppg) : "—"}</td>
                        <td className="numeric">{production?.ts == null ? "—" : percent(production.ts)}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              ) : <p className="empty">No current roster listing is attached to this team in the published snapshot.</p>}
            </section>
          ))}
        </div>
      </section>

      {lens && (
        <section className="section notebook-angle">
          <div className="eyebrow">The reporting angle</div>
          <h2>{lens.title}.</h2>
          <p>{lens.body}</p>
          <h3>Questions for the next check</h3>
          <ol>
            {lens.questions.map((question) => <li key={question}>{question}</li>)}
          </ol>
        </section>
      )}

      {factorRows.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Factor context</div>
              <h2>Why the baseline leans.</h2>
            </div>
            <Link href={`/basketball/briefs/${game.id}/`}>Open the full brief →</Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Factor</th><th className="numeric">Home attack</th><th className="numeric">Away defense</th><th className="numeric">Away attack</th><th className="numeric">Home defense</th><th className="numeric">Edge</th></tr></thead>
              <tbody>{factorRows.map((row) => <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td className="numeric">{percent(row.values.home_offense)}</td>
                <td className="numeric">{percent(row.values.away_defense)}</td>
                <td className="numeric">{percent(row.values.away_offense)}</td>
                <td className="numeric">{percent(row.values.home_defense)}</td>
                <td className="numeric">{row.edge == null ? "—" : `${row.edge >= 0 ? "Home" : "Away"} ${Math.abs(row.edge * 100).toFixed(1)} pts`}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="note">These are the stored matchup-factor estimates for this edition. They identify a film starting point; they do not establish a tactical result or a player availability decision.</p>
        </section>
      )}


      <section className="section two-col">
        <div className="paper-panel">
          <div className="eyebrow">What still needs checking</div>
          <h2>Keep the evidence chain open.</h2>
          <ul>
            <li>Confirm current availability and the expected rotation from a dated update.</li>
            <li>Use the roster and player archives to identify the personnel behind each factor.</li>
            <li>Read the interval before treating a close projection as a decisive edge.</li>
          </ul>
          <p><Link href="/basketball/recruiting/">Open recruiting evidence →</Link></p>
        </div>
        <div className="paper-panel">
          <div className="eyebrow">Record trail</div>
          <h2>Follow the record.</h2>
          <p className="note">The schedule ID, model edition and captured forecast remain attached to this notebook. A missing market observation is unavailable evidence, not a zero.</p>
          <p><Link href={`/basketball/briefs/${game.id}/`}>Read matchup evidence →</Link></p>
          <p><Link href={`/basketball/forecast-lab/?game=${encodeURIComponent(game.id)}`}>Open in forecast lab →</Link></p>
          {game.market_comparisons?.length ? <p className="note">{game.market_comparisons.length} verified pregame market observation{game.market_comparisons.length === 1 ? "" : "s"} attached to this edition.</p> : <p className="note">No verified pregame market line is attached to this edition.</p>}
        </div>
      </section>
    </article>
  );
}
