import Link from "next/link";
import LiveBasketballJournal from "../../blog/LiveBasketballJournal";
import { getBasketball, getRosterModel } from "../../_lib/basketball-data";
import { date } from "../../_lib/format";
import NotebookFinder from "./NotebookFinder";
import type { NotebookIndexGame } from "./notebook-index";
import { recruitingGamePlayerEvidence, recruitingGamePlayerHref, selectRecruitingGameLenses } from "../../blog/recruiting-game-lens";

export const metadata = {
  title: "Upcoming basketball game notebooks",
  description:
    "Read forecast-backed 2026–27 men’s college basketball game notebooks with Four Factors, uncertainty and preparation questions.",
  alternates: { canonical: "/basketball/blog/" },
};

export default function Page() {
  const basketball = getBasketball();
  const rosterModel = getRosterModel();
  const games = basketball.upcoming
    .filter((game) => game.prediction || game.fallback_prediction);
  const notebookIndex: NotebookIndexGame[] = games.slice(0, 8).map((game) => {
    const forecast = game.prediction || game.fallback_prediction!;
    return {
      id: game.id,
      startsAt: game.starts_at,
      awayId: game.away_id,
      awayName: game.away_name,
      homeId: game.home_id,
      homeName: game.home_name,
      neutral: Boolean(game.neutral),
      timeTbd: Boolean(game.time_tbd),
      forecast: {
        awayScore: forecast.away_score,
        homeScore: forecast.home_score,
        homeWinProbability: forecast.home_win_probability,
        marginLow: forecast.margin_low,
        marginHigh: forecast.margin_high,
        estimateType: forecast.estimate_type === "cold_start" ? "cold_start" : "primary",
      },
    };
  });
  const nextGame = games[0];
  const recruitingLenses = selectRecruitingGameLenses(
    games,
    rosterModel,
    rosterModel.scenarios,
  );
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Basketball notebooks / {date(basketball.generated_at)} edition</div>
        <h1>Prepare for the next game.</h1>
        <p>
          Forecast-backed notebooks turn the 2026–27 slate into a research
          queue: read the range, identify the Four Factors, then take the next
          question to the roster, film and stat archives.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/matchups/">Open the full matchup desk ↗</Link>
          <Link className="hero-link" href="/basketball/forecast-lab/">Compare model editions →</Link>
          <Link className="hero-link" href="/blog/">Read all field guides →</Link>
        </div>
      </div>
      <div className="strip">
        <div><strong>{games.length.toLocaleString()}</strong><span>Searchable game notebooks</span></div>
        <div><strong>{basketball.coverage.forecast_games.toLocaleString()}</strong><span>Published 2026–27 forecasts</span></div>
        <div><strong>{basketball.model.evaluation.games.toLocaleString()}</strong><span>Held-out games behind the test</span></div>
        <div><strong>{nextGame ? date(nextGame.starts_at) : "—"}</strong><span>Next scheduled date</span></div>
      </div>
      <NotebookFinder games={notebookIndex} total={games.length} />
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Live notebook queue</div>
            <h2>Start with the highest-leverage questions.</h2>
          </div>
          <Link href="/basketball/briefs/">Open evidence briefs →</Link>
        </div>
        <p className="note">
          The queue refreshes from the latest retained D1 forecast edition when
          available. Each notebook keeps the model range and data caveats
          attached; a generated preview is a starting point for reporting, not
          a claim about availability or a betting edge.
        </p>
        <LiveBasketballJournal games={games.slice(0, 12)} ratings={basketball.ratings} />
      </section>
      <section className="section" aria-labelledby="recruiting-game-lens">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Recruiting lens / exact game joins</div>
            <h2 id="recruiting-game-lens">Where roster evidence changes the matchup question.</h2>
          </div>
          <Link href="/basketball/recruiting/">Open the recruiting board →</Link>
        </div>
        <p className="note">
          These are the upcoming games with the largest absolute difference between the primary efficiency forecast and the same-edition roster-continuity challenger. The challenger uses recorded roster identity, prior workload and retained player production; it is research context, not a replacement forecast or an availability ruling. Watched player names link to the exact prior-season player archive by athlete ID.
        </p>
        <div className="article-grid">
          {recruitingLenses.map(({ game, scenario }) => {
            const watched = [...(scenario.home_player_watch || []), ...(scenario.away_player_watch || [])]
              .sort((a, b) => b.prior_minutes - a.prior_minutes)
              .slice(0, 2);
            return (
              <article className="article-card" key={game.id}>
                <div className="eyebrow">{date(game.starts_at)} · Roster continuity</div>
                <h2>{game.away_name} at {game.home_name}</h2>
                <p>
                  Primary margin {game.prediction!.home_margin > 0 ? "+" : ""}{game.prediction!.home_margin.toFixed(1)} · roster lens {scenario.roster_margin > 0 ? "+" : ""}{scenario.roster_margin.toFixed(1)} · shift {scenario.margin_delta > 0 ? "+" : ""}{scenario.margin_delta.toFixed(1)} points.
                </p>
                {watched.length ? <p className="note">Largest prior-minute files: {watched.map((player, index) => <span key={player.athlete_id}>{index > 0 ? " · " : ""}<Link href={recruitingGamePlayerHref(player.athlete_id, rosterModel.target_season - 1)}>{player.name}</Link> ({recruitingGamePlayerEvidence(player)}).</span>)} The BPM and continuity labels are retained scenario evidence; they do not establish current availability or role.</p> : <p className="note">No player watch rows were retained for this scenario.</p>}
                <Link href={`/basketball/briefs/${encodeURIComponent(game.id)}/`}>Read the matchup evidence →</Link>
              </article>
            );
          })}
        </div>
        {!recruitingLenses.length && <p className="empty">No exact-edition roster scenarios are available for the current notebook queue.</p>}
      </section>
      <section className="section two-col">
        <article className="paper-panel">
          <div className="eyebrow">Read the baseline</div>
          <h2>What does the model actually know?</h2>
          <p>Inspect training seasons, calibration, interval coverage and the exact schedule row before carrying a forecast into a staff conversation.</p>
          <Link href="/basketball/model/">Open the model notebook →</Link>
        </article>
        <article className="paper-panel">
          <div className="eyebrow">Keep the evidence open</div>
          <h2>Who could change the matchup?</h2>
          <p>Pair the matchup with player logs, roster observations, recruiting records and published news. Missing evidence stays visible instead of becoming an assumption.</p>
          <div className="button-row"><Link href="/basketball/recruiting/">Recruiting evidence →</Link><Link href="/basketball/ncaa-rankings/">Player rankings →</Link></div>
        </article>
      </section>
    </>
  );
}
