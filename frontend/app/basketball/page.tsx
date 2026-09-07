import Link from "next/link";
import {
  getBasketball,
  getRosters,
  getRecruiting,
} from "../_lib/basketball-data";
import { date, fmt } from "../_lib/format";
import BasketballCard from "../_components/BasketballCard";
export const metadata = {
  title: "2026–27 basketball stats, scouting and recruiting research",
};
export default function Page() {
  const d = getBasketball(),
    r = getRosters(),
    recruiting = getRecruiting(),
    e = d.model.evaluation;
  return (
    <>
      <div className="dateline eyebrow">
        <span>Men’s college basketball · {d.label}</span>
        <span>Edition {date(d.generated_at)}</span>
      </div>
      <section className="hero basketball-hero">
        <div className="hero-copy">
          <div className="eyebrow">A new season. A deeper scouting book.</div>
          <h1>
            See the game
            <br />
            <em>before it happens.</em>
          </h1>
          <p>
            Opponent-adjusted efficiency. Real player production. Dated
            recruiting evidence. Turn the next matchup into a better game plan.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/basketball/gameplan/">
              Open the game plan ↗
            </Link>
            <Link className="hero-link" href="/basketball/recruiting/">
              Study recruiting evidence →
            </Link>
          </div>
        </div>
        <div className="field">
          <div className="field-card">
            <div className="eyebrow">The independent test / 2025–26</div>
            <div className="score-line">
              <span>Winner accuracy</span>
              <strong>{fmt(e.winner_accuracy * 100)}%</strong>
            </div>
            <div className="score-line">
              <span>Margin error</span>
              <strong>{fmt(e.margin_mae)}</strong>
            </div>
            <div className="field-note">
              {e.games.toLocaleString()} HELD-OUT GAMES
              <br />
              CALIBRATION: 2024–25 · TEST: 2025–26
              <br />
              MODEL {d.model.version}
            </div>
          </div>
        </div>
      </section>
      <div className="strip">
        <div>
          <strong>{d.coverage.player_box_rows.toLocaleString()}</strong>
          <span>Player box-score records · 2025–26</span>
        </div>
        <div>
          <strong>{d.coverage.forecast_games.toLocaleString()}</strong>
          <span>Published 2026–27 forecasts</span>
        </div>
        <div>
          <strong>{r.players_observed.toLocaleString()}</strong>
          <span>Players on observed 2026–27 rosters</span>
        </div>
        <div>
          <strong>{d.ratings.length}</strong>
          <span>Programs with efficiency ratings</span>
        </div>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / The next matchup</div>
            <h2>The season takes shape.</h2>
          </div>
          <Link href="/basketball/matchups/">Full published slate →</Link>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>
          The source has published {d.coverage.upcoming_games.toLocaleString()}{" "}
          games so far. This is a partial schedule, not the complete season.
        </p>
        <div className="match-grid">
          {d.upcoming
            .filter((g) => g.prediction)
            .slice(0, 3)
            .map((g) => (
              <BasketballCard key={g.id} game={g} />
            ))}
        </div>
      </section>
      <section className="section two-col">
        <div>
          <div className="section-heading">
            <div>
              <div className="eyebrow">02 / Both ends of the floor</div>
              <h2>Quality beyond tempo.</h2>
            </div>
            <Link href="/basketball/ratings/">Full table →</Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Program</th>
                  <th className="numeric">Adj O</th>
                  <th className="numeric">Adj D</th>
                  <th className="numeric">Net</th>
                </tr>
              </thead>
              <tbody>
                {d.ratings.slice(0, 10).map((t) => (
                  <tr key={t.id}>
                    <td className="rank-number">{t.rank}</td>
                    <td>
                      <Link href={`/basketball/programs/${t.id}/`}>
                        {t.name}
                      </Link>
                    </td>
                    <td className="numeric">{fmt(t.adj_off)}</td>
                    <td className="numeric">{fmt(t.adj_def)}</td>
                    <td className="numeric">{fmt(t.adj_net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Points per 100 estimated possessions, opponent-adjusted with ridge
            regression. Lower defensive efficiency is better.
          </p>
        </div>
        <aside className="paper-panel">
          <div className="eyebrow">03 / Roster construction</div>
          <h2 style={{ marginTop: 22 }}>
            Know what changed.
            <br />
            Know what is unknown.
          </h2>
          <p>
            School announcements connect incoming players to prior college
            production. See the original signing and any later availability
            statement side by side.
          </p>
          <div className="rule-list">
            <div>
              <span>Announced additions</span>
              <strong>{recruiting.coverage.players}</strong>
            </div>
            <div>
              <span>Programs in this partial review</span>
              <strong>{recruiting.coverage.programs}</strong>
            </div>
            <div>
              <span>Reviewed historical stat links</span>
              <strong>{recruiting.coverage.historical_links}</strong>
            </div>
          </div>
          <p>
            Coverage is partial, even within reviewed programs. A signing alone
            does not establish eligibility or current availability.
          </p>
          <p>
            <Link href="/basketball/recruiting/">
              Open the recruiting file →
            </Link>
          </p>
        </aside>
      </section>
      <section className="section banner">
        <div>
          <div className="eyebrow">04 / Player evaluation</div>
          <h3 style={{ marginTop: 12 }}>Production meets lineup context.</h3>
          <p>
            Browse box-score rates and shooting efficiency, then study the
            publisher’s NCAA league-wide regularized adjusted plus-minus
            rankings. Source identities remain separate where a match has not
            been verified.
          </p>
        </div>
        <Link className="button secondary" href="/basketball/impact/">
          Explore player impact ↗
        </Link>
      </section>
    </>
  );
}
