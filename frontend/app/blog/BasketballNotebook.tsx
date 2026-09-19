import Link from "next/link";
import type { BBGame, BBRoster, BBRosterScenario, BBTeam } from "../_lib/basketball-types";
import type { ScoutPlayer } from "../_lib/scouting-types";
import { basketballEditorialLens } from "../_lib/basketball-editorial";
import { date, fmt } from "../_lib/format";
import { summarizeNotebookRoster } from "./notebook-roster";

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
}) {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
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
