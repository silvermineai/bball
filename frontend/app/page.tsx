import Link from "next/link";
import { getFootballEfficiencyModel, getOverview } from "./_lib/data";
import { date, fmt } from "./_lib/format";
import MatchCard from "./_components/MatchCard";
import fs from "node:fs";
import path from "node:path";
import { topFootballLeaders, type LeaderPlayer } from "./_lib/football-leaders";

function getFootballLeaders() {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football/player-catalog.json"),
      "utf8",
    ),
  ) as { seasons: { season: number; file: string }[] };
  const complete = [...catalog.seasons]
    .filter((s) => s.season < 2026)
    .sort((a, b) => b.season - a.season)[0];
  if (!complete) return null;
  const data = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/data/football", complete.file),
      "utf8",
    ),
  ) as { players: LeaderPlayer[] };
  return {
    season: complete.season,
    passing: topFootballLeaders(data.players, "passing"),
    rushing: topFootballLeaders(data.players, "rushing"),
    receiving: topFootballLeaders(data.players, "receiving"),
  };
}

const leaderCategoryLabels = {
  passing: "Passing EPA",
  rushing: "Rushing EPA",
  receiving: "Receiving EPA",
} as const;
export default function Home() {
  const d = getOverview(),
    efficiencyModel = getFootballEfficiencyModel(),
    e = d.model.evaluation,
    g = d.upcoming.find((g) => g.prediction),
    p = g?.prediction,
    leaders = getFootballLeaders();
  return (
    <>
      <div className="dateline eyebrow">
        <span>College football · The {d.season} field guide</span>
        <span>Data edition: {date(d.generated_at)}</span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">For the people who study the game.</div>
          <h1>
            The next game
            <br />
            starts with
            <br />
            <em>a better question.</em>
          </h1>
          <p>
            Go beyond the score. Explore player production, study the matchups,
            and put every prediction under the microscope.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/football/matchups/">
              Explore the matchups <span>↗</span>
            </Link>
            <Link className="hero-link" href="/football/players/">
              Find a player →
            </Link>
          </div>
        </div>
        <div className="field">
          <div className="field-card">
            <div className="eyebrow">On the board / week {g?.week}</div>
            <div className="score-line">
              <span>{g?.away_name}</span>
              <strong>{fmt(p?.away_score)}</strong>
            </div>
            <div className="score-line">
              <span>{g?.home_name}</span>
              <strong>{fmt(p?.home_score)}</strong>
            </div>
            <div className="field-note">
              MODEL ESTIMATE · NOT A RESULT
              <br />
              HOME WIN PROBABILITY{" "}
              {fmt(p ? p.home_win_probability * 100 : null)}%<br />
              Calibrated score model · uncertainty included
            </div>
          </div>
        </div>
      </section>
      <div className="strip">
        <div>
          <strong>{d.coverage.games.toLocaleString()}</strong>
          <span>Schedule records · 2022–26</span>
        </div>
        <div>
          <strong>{d.coverage.box_rows.toLocaleString()}</strong>
          <span>Current model player box-score rows</span>
        </div>
        <div>
          <strong>{d.coverage.forecast_games}</strong>
          <span>Upcoming FBS forecasts</span>
        </div>
        <div>
          <strong>{fmt(e.margin_mae)} pts</strong>
          <span>Margin error · {e.season} holdout</span>
        </div>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / Look ahead</div>
            <h2>The upcoming slate.</h2>
          </div>
          <Link href="/football/matchups/">
            All {d.coverage.upcoming_games} games →
          </Link>
        </div>
        <div className="match-grid">
          {d.upcoming
            .filter((g) => g.prediction)
            .slice(0, 3)
            .map((g) => (
              <MatchCard key={g.id} game={g} efficiencyScenario={efficiencyModel.scenarios.find((scenario) => scenario.game_id === g.id)} />
            ))}
        </div>
      </section>
      {leaders && (
        <section className="section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">02 / Player production</div>
              <h2>The players driving the numbers.</h2>
            </div>
            <Link href="/football/players/">Full player index →</Link>
          </div>
          <p className="note" style={{ marginBottom: 20 }}>
            Latest complete source season: {leaders.season}. Ranked by total
            expected points added within each category; early or unranked rows
            stay out of this board.
          </p>
          <div className="football-leader-grid">
            {(["passing", "rushing", "receiving"] as const).map((category) => (
              <div className="paper-panel" key={category}>
                <div className="eyebrow">{leaderCategoryLabels[category]}</div>
                <div className="football-leader-list">
                  {leaders[category].map((player) => (
                    <Link
                      className="football-leader-row"
                      href={`/football/player/?id=${encodeURIComponent(player.id)}&season=${leaders.season}`}
                      key={player.id}
                    >
                      <span className="rank-number">{player.rank}</span>
                      <span>
                        <strong>{player.name}</strong>
                        <small>
                          {player.team} · {player.conference}
                        </small>
                      </span>
                      <span className="numeric">
                        {fmt(player.epa)}
                        <small>{fmt(player.epa_per_play, 2)} / play</small>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="section two-col">
        <div>
          <div className="section-heading">
            <div>
              <div className="eyebrow">03 / The national picture</div>
              <h2>Strength, adjusted.</h2>
            </div>
            <Link href="/football/ratings/">Full ratings →</Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Program</th>
                  <th>Conference</th>
                  <th className="numeric">Rating</th>
                </tr>
              </thead>
              <tbody>
                {d.ratings.slice(0, 8).map((t) => (
                  <tr key={t.id}>
                    <td className="rank-number">
                      {String(t.rank).padStart(2, "0")}
                    </td>
                    <td>
                      <Link
                        href={`/football/matchups/?team=${encodeURIComponent(t.name)}`}
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td>{t.conference}</td>
                    <td className="numeric">{fmt(t.rating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Ridge estimates of team strength in points. Historical score
            margins, adjusted for opponents and home field.
          </p>
        </div>
        <aside className="paper-panel">
          <div className="eyebrow">04 / Show your work</div>
          <h2 style={{ marginTop: 20 }}>
            A prediction is
            <br />a starting point.
          </h2>
          <p>
            We publish how the model works and how often it misses. This
            baseline uses past scores and home field; it does not yet account
            for roster turnover or injuries.
          </p>
          <div className="rule-list">
            <div>
              <span>Untouched test season</span>
              <strong>{e.season}</strong>
            </div>
            <div>
              <span>Games evaluated</span>
              <strong>{e.games}</strong>
            </div>
            <div>
              <span>Probability-pick accuracy</span>
              <strong>{fmt(e.winner_accuracy * 100)}%</strong>
            </div>
            <div>
              <span>Average margin error</span>
              <strong>{fmt(e.margin_mae)} pts</strong>
            </div>
          </div>
          <p>
            <Link href="/football/methodology/">Open the model notebook →</Link>
          </p>
          <p>
            <Link href="/football/evaluation/">
              Compare preseason and weekly learning →
            </Link>
          </p>
        </aside>
      </section>
      <section className="section banner">
        <div>
          <div className="eyebrow">From the hardwood</div>
          <h3 style={{ marginTop: 12 }}>
            The next basketball season is taking shape.
          </h3>
          <p>
            Explore 2026–27 forecasts, possession-based ratings, player
            production and observed roster changes, alongside the scouting
            archive.
          </p>
        </div>
        <a className="button secondary" href="/basketball/">
          Enter basketball ↗
        </a>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">05 / The journal</div>
            <h2>Notes from the desk.</h2>
          </div>
          <Link href="/blog/">Read the journal →</Link>
        </div>
        <div className="article-grid">
          <article className="article-card">
            <div className="eyebrow">Research note · 5 min read</div>
            <h2>What a preseason model knows. And what it misses.</h2>
            <p>
              Why a schedule-adjusted score model gives us a useful baseline—and
              why new quarterbacks, new coaches and new systems still matter.
            </p>
            <Link href="/blog/reading-the-forecast/">Read the notebook →</Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Player evaluation · 4 min read</div>
            <h2>Production is a question of context.</h2>
            <p>
              Use expected points added to compare contributions within a role.
              Then look at workload, opponent quality and the film.
            </p>
            <Link href="/blog/understanding-player-epa/">
              Read the field guide →
            </Link>
          </article>
          <article className="article-card">
            <div className="eyebrow">Market research · 4 min read</div>
            <h2>Before measuring an edge, check the clock.</h2>
            <p>
              A historical line without a timestamp cannot prove what was
              available before kickoff. Here is how we keep the comparison
              honest.
            </p>
            <Link href="/blog/market-comparison/">Read the methodology →</Link>
          </article>
        </div>
      </section>
    </>
  );
}
