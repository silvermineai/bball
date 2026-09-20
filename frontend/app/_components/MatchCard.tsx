import Link from "next/link";
import type { FootballEfficiencyScenario, Game } from "../_lib/data";
import type { FootballCardIntel } from "../_lib/football-brief";
import { date, fmt, kick } from "../_lib/format";
import { comparisonGapDirection, comparisonGapLabel } from "../_lib/market-display";
import type { FootballRecruitingTeam } from "../_lib/football-recruiting-context";
const categoryLabel: Record<string, string> = {
  passing: "Pass",
  rushing: "Rush",
  receiving: "Receive",
};
export default function MatchCard({
  game: g,
  efficiencyScenario,
  intel,
  recruiting,
}: {
  game: Game;
  efficiencyScenario?: FootballEfficiencyScenario;
  intel?: FootballCardIntel;
  recruiting?: { home?: FootballRecruitingTeam; away?: FootballRecruitingTeam };
}) {
  const p = g.prediction;
  return (
    <article className="match-card">
      <div className="meta">
        <span>
          WEEK {g.week} · {g.neutral ? "NEUTRAL" : "HOME / AWAY"}
        </span>
        <span>{g.time_tbd ? "TIME TBD" : kick(g.kickoff)}</span>
      </div>
      <h3>
        {g.away_name}
        <span className="muted"> at </span>
        {g.home_name}
      </h3>
      {p ? (
        <>
          <div className="prediction-score">
            <div>
              {fmt(p.away_score)}
              <small>{g.away_name}</small>
            </div>
            <div>
              {fmt(p.home_score)}
              <small>{g.home_name}</small>
            </div>
          </div>
          <div className="prob-bar" aria-hidden="true">
            <span style={{ width: `${p.home_win_probability * 100}%` }} />
          </div>
          <div className="match-detail">
            <span>Home win estimate</span>
            <strong className="mono">
              {fmt(p.home_win_probability * 100)}%
            </strong>
          </div>
          <div className="match-detail muted">
            <span>80% home-margin range</span>
            <span>
              {fmt(p.margin_low)} to {fmt(p.margin_high)}
            </span>
          </div>
          <small className="factor-source">
            Model edition <code>{p.model_id || "unlabeled"}</code>
            {p.generated_at ? ` · registered ${date(p.generated_at)}` : " · registration clock unavailable"}
          </small>
        </>
      ) : (
        <p className="note">
          No forecast: a team is outside the model’s trained FBS field. Schedule
          retained for planning.
        </p>
      )}
      {intel && intel.programs.some((program) => program.leaders.length) && (
        <section className="football-card-intel" aria-label={`${intel.playerSeason} player production to review`}>
          <div className="football-card-intel-heading">
            <strong>Personnel to review</strong>
            <span>{intel.playerSeason} retained production</span>
          </div>
          <div className="football-card-intel-grid">
            {intel.programs.map((program) => (
              <div key={program.id}>
                <h4>{program.name}</h4>
                {program.leaders.length ? (
                  <ul>
                    {program.leaders.map((leader) => (
                      <li key={`${leader.category}-${leader.id}`}>
                        <Link href={`/football/player/?id=${encodeURIComponent(leader.id)}&season=${intel.playerSeason}`}>
                          {leader.name}
                        </Link>
                        <small>{categoryLabel[leader.category] || leader.category} · {fmt(leader.epaPerPlay, 2)} EPA/play · {leader.plays.toLocaleString()} plays</small>
                      </li>
                    ))}
                  </ul>
                ) : <p>No qualified category leader.</p>}
              </div>
            ))}
          </div>
          <small className="football-card-intel-note">
            Prior-season source affiliation; this does not verify the current roster or availability.
          </small>
        </section>
      )}
      {recruiting && (recruiting.home || recruiting.away) && (
        <section className="football-card-intel" aria-label="Recruiting and returning production context">
          <div className="football-card-intel-heading">
            <strong>Personnel context</strong>
            <span>Retained team-level recruiting edition</span>
          </div>
          <div className="football-card-intel-grid">
            {[recruiting.away, recruiting.home].map((team) => team ? (
              <div key={team.team_id}>
                <h4>{team.team}</h4>
                <ul>
                  <li><strong>{team.talent_rank == null ? "—" : `#${team.talent_rank}`}</strong><small>Talent rank · {team.talent_composite == null ? "composite unavailable" : `${fmt(team.talent_composite, 1)} composite`}</small></li>
                  <li><strong>{team.overall_returning == null ? "—" : `${fmt(team.overall_returning * 100, 1)}%`}</strong><small>Returning production · {team.n_returning == null ? "player count unavailable" : `${fmt(team.n_returning, 0)} players`}</small></li>
                  <li><strong>{team.blue_chip_ratio == null ? "—" : `${fmt(team.blue_chip_ratio * 100, 1)}%`}</strong><small>Blue-chip ratio · {team.returning_estimated == null ? "estimate status unavailable" : team.returning_estimated ? "returning estimate" : "reported returning"}</small></li>
                </ul>
              </div>
            ) : <div key="missing"><h4>Team personnel context</h4><p>Exact team-ID context unavailable.</p></div>)}</div>
          <small className="football-card-intel-note">Personnel context is descriptive and season-scoped; it does not alter the primary forecast or establish eligibility, availability or starting roles.</small>
        </section>
      )}
      {efficiencyScenario && (
        <div className="market-note">
          <strong>Efficiency challenger · research-only</strong><br />
          Margin {fmt(efficiencyScenario.challenger_margin)} · shift {efficiencyScenario.margin_delta > 0 ? "+" : ""}{fmt(efficiencyScenario.margin_delta)} pts
          <br />
          Advanced lagged rates do not change the primary probability, range or ledger.
        </div>
      )}
      {g.market_comparisons?.length ? (
        <div className="market-quotes">
          <div className="match-detail">
            <strong>Verified pregame lines</strong>
            <span className="muted">licensed ledger</span>
          </div>
          {g.market_comparisons.slice(0, 3).map((quote) => (
            <div className="market-quote" key={`${quote.provider}-${quote.bookmaker}-${quote.market}`}>
              <span>
                Verified line · {quote.market}
                <small>Captured {quote.captured_at.replace("T", " ").replace("Z", " UTC").slice(0, 22)}</small>
                {comparisonGapLabel(quote) && <small className={`market-gap-${comparisonGapDirection(quote)}`}>Model gap · {comparisonGapLabel(quote)}</small>}
              </span>
              <strong>
                {quote.market === "h2h"
                  ? quote.market_home_probability == null ? "—" : `${fmt(quote.market_home_probability * 100, 1)}% home`
                  : quote.line == null ? "—" : quote.market === "totals" ? `O/U ${fmt(quote.line, 1)}` : `Home ${quote.line > 0 ? "+" : ""}${fmt(quote.line, 1)}`}
              </strong>
            </div>
          ))}
          <small className="factor-source">Pregame quotes are shown only when the ledger matched the exact game and captured them before kickoff. They are observations, not recommendations.</small>
        </div>
      ) : null}
      <div className="market-note">
        {g.market ? (
          <>
            <strong>Archived market checkpoint</strong><br />
            Home spread {fmt(g.market.home_spread)} · model margin {p ? fmt(p.home_margin) : "—"} · model gap{" "}
            {fmt(g.market.margin_difference)} pts
            <br />
            {g.market.total != null && p ? `Total ${fmt(g.market.total)} · model ${fmt(p.total)} · gap ${fmt(p.total - g.market.total)} pts` : "Total unavailable in this archive row."}
            <br />
            Observed {kick(g.market.observed_at)}. Bookmaker timestamp
            unavailable; archival reference only.
          </>
        ) : (
          <>
            <strong>Market checkpoint</strong><br />
            No verified pregame line is attached to this game. The archive is
            linked from the research desk; this card never guesses a current
            price.
          </>
        )}
      </div>
      {p && (
        <div className="button-row football-card-actions">
          <Link className="note" href={`/blog/game-${g.id}/`}>
            Read the matchup brief →
          </Link>
          <Link className="note" href={`/research/game/?sport=football&id=${encodeURIComponent(g.id)}`}>
            Forecast record ↗
          </Link>
        </div>
      )}
    </article>
  );
}
