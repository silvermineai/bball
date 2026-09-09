import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  espnGameUrl,
  getBasketball,
  getRecruiting,
  getRosters,
} from "../../../_lib/basketball-data";
import { getScoutProfile } from "../../../_lib/scouting-data";
import { getLedger } from "../../../_lib/research-data";
import { date, fmt, kick, signed } from "../../../_lib/format";
import {
  adjustedFactorPoints,
  briefEvidence,
  briefFactors,
  briefScenarioUrl,
} from "../../../_lib/matchup-brief";
import { eventLabels, publicationDate } from "../../../_lib/recruiting";
import { reasons } from "../../../_lib/research-types";
import type { Metric } from "../../../_lib/scouting-types";
import BriefNotebook from "../BriefNotebook";
import ManualMarketCheck from "../ManualMarketCheck";
import LiveBriefForecastStatus from "../LiveBriefForecastStatus";

export function generateStaticParams() {
  return getBasketball()
    .upcoming.filter((g) => g.prediction)
    .map((g) => ({ id: g.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    g = getBasketball().upcoming.find((g) => g.id === id);
  return {
    title: g
      ? `${g.away_name} vs ${g.home_name}: 2026–27 basketball scouting brief`
      : "Basketball preview",
    description: g
      ? `Forecast, Four Factors, historical personnel and dated roster evidence for ${g.away_name} versus ${g.home_name}.`
      : undefined,
    alternates: { canonical: `/basketball/briefs/${id}/` },
  };
}
function Rate({ metric }: { metric: Metric | undefined }) {
  return (
    <>
      <strong>
        {metric?.value == null ? "—" : fmt(metric.value * 100) + "%"}
      </strong>
      <small>
        {metric?.games ?? 0} games
        {metric?.rank != null
          ? ` · rank ${metric.rank}/${metric.population}`
          : ""}
      </small>
    </>
  );
}
function EvidenceTime({ value }: { value: string }) {
  return (
    <time dateTime={value} title={value}>
      {new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "UTC",
      }).format(new Date(value))}{" "}
      UTC
    </time>
  );
}

type PublisherArticle = {
  id: string;
  headline: string;
  description: string;
  published: string;
  link: string;
  publisher?: string;
  sport?: string;
};

function relatedPublisherArticles(game: { home_name: string; away_name: string }) {
  const release = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/news.json"), "utf8"),
  ) as { articles?: PublisherArticle[] };
  const text = (article: PublisherArticle) =>
    `${article.headline} ${article.description}`.toLowerCase();
  const terms = [game.home_name, game.away_name]
    .map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .flatMap((name) => {
      const first = name.split(" ")[0] || "";
      return [name, first.length >= 5 && !["state", "college", "university"].includes(first) ? first : ""];
    })
    .filter(Boolean);
  return (release.articles || [])
    .filter((article) => article.sport === "mens-college-basketball" && terms.some((term) => text(article).includes(term)))
    .slice(0, 4);
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    d = getBasketball(),
    g = d.upcoming.find((g) => g.id === id),
    p = g?.prediction;
  if (!g || !p) notFound();
  const home = getScoutProfile(g.home_id),
    away = getScoutProfile(g.away_id),
    recruiting = getRecruiting(),
    rosters = getRosters(),
    ledger = getLedger();
  const evidence = briefEvidence(g, d, home, away, recruiting, ledger, rosters),
    favorite = p.home_margin >= 0 ? g.home_name : g.away_name;
  const tasks = [
    ...evidence.pressures.map(
      (point) =>
        `${point.offense} offense vs ${point.defense}: review ${point.factor.label.toLowerCase()}.`,
    ),
    "Confirm current availability and the expected rotation with dated school evidence.",
    "Check the forecast record and capture time before using a market comparison.",
  ];
  const record = evidence.ledger,
    quotes = record && !record.exclusion ? record.comparisons : [],
    publisherArticles = relatedPublisherArticles(g);
  return (
    <article className="matchup-brief">
      <header className="page-title">
        <div className="eyebrow">2026–27 / Basketball scouting brief</div>
        <h1>
          {g.away_name}
          <br />
          <span className="brief-versus">vs</span> {g.home_name}
        </h1>
        <p>
          The projected game, the historical pressure points and the personnel
          questions to take into preparation. Generated from published
          statistics and reviewed announcements.
        </p>
        <p className="brief-schedule">
          <strong>
            {g.time_tbd
              ? `${date(g.starts_at)} · start time unconfirmed`
              : kick(g.starts_at)}
          </strong>
          <span>
            {g.neutral ? "Neutral floor" : `${g.home_name} designated home`}
            {g.venue ? ` · ${g.venue}` : ""}
          </span>
        </p>
        <div className="hero-actions">
          <Link className="button" href={briefScenarioUrl(g)}>
            Open this venue in the workbench ↗
          </Link>
          <a className="hero-link" href="#brief-notes">
            Preparation notes ↓
          </a>
          <Link
            className="hero-link"
            href={`/research/game/?sport=basketball&id=${g.id}`}
          >
            Forecast history →
          </Link>
          <a className="hero-link" href={espnGameUrl(g.id)} target="_blank" rel="noreferrer">
            Open ESPN source game ↗
          </a>
        </div>
      </header>
      <section className="brief-scoreboard" aria-label="Model forecast">
        <div>
          <span>{g.away_name}</span>
          <strong>{fmt(p.away_score)}</strong>
          <small>Projected away score</small>
        </div>
        <div className="brief-score-center">
          <span>Preseason baseline</span>
          <strong>
            {p.home_margin === 0
              ? "Even projected score"
              : `${favorite} by ${fmt(Math.abs(p.home_margin), Math.abs(p.home_margin) < 1 ? 2 : 1)}`}
          </strong>
          <small>
            Projected winning margin · {fmt(p.pace)} possessions / 40 min
          </small>
          <p>
            {g.home_name} win estimate {fmt(p.home_win_probability * 100)}%
          </p>
        </div>
        <div>
          <span>{g.home_name}</span>
          <strong>{fmt(p.home_score)}</strong>
          <small>Projected home score</small>
        </div>
      </section>
      <div className="brief-forecast-note">
        <p>
          Projected total <strong>{fmt(p.total)}</strong>. Nominal 80% range for
          home scoring margin:{" "}
          <strong>
            {signed(p.margin_low)} to {signed(p.margin_high)}
          </strong>
          .{" "}
          {p.margin_low <= 0 && p.margin_high >= 0
            ? "Either team winning falls within that range."
            : "Outcomes outside that range remain possible."}
        </p>
        <p className="note">
          The model uses historical opponent-adjusted efficiency and tempo. It
          has no current roster or injury inputs. Schedule details are partial
          and may change. Model edition: {date(d.generated_at)}.
        </p>
      </div>
      <LiveBriefForecastStatus gameId={g.id} staticEdition={d.generated_at} />
      <ManualMarketCheck
        storageKey={`brief:${g.id}`}
        gameId={g.id}
        homeName={g.home_name}
        modelMargin={p.home_margin}
        modelMarginLow={p.margin_low}
        modelMarginHigh={p.margin_high}
        modelTotal={p.total}
        modelHomeWinProbability={p.home_win_probability}
      />
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              01 / Prior-season evidence → Film questions
            </div>
            <h2>Where the styles meet.</h2>
          </div>
          <span className="note">2025–26 observations</span>
        </div>
        <p className="note brief-explainer">
          These are historical questions, not forecast adjustments. Each
          direction highlights up to two Four Factors with the largest
          difference in favorable percentile between one offense and the
          opposing defense. Rates came against different schedules and
          personnel; their difference is not an expected matchup outcome.
        </p>
        <div className="brief-pressure-grid">
          {evidence.pressures.map((point, i) => (
            <section
              className="brief-pressure"
              key={`${point.offense}-${point.factor.key}`}
            >
              <div className="eyebrow">
                {String(i + 1).padStart(2, "0")} / {point.category}
              </div>
              <h3>{point.factor.title}</h3>
              <p className="brief-direction">
                {point.offense} offense <span>↔</span> {point.defense} defense
              </p>
              <div className="brief-pressure-values">
                <div>
                  <span>{point.offense} · offense</span>
                  <Rate metric={point.offensive} />
                </div>
                <div>
                  <span>
                    {point.defense} ·{" "}
                    {point.factor.key === "tov"
                      ? "turnovers forced"
                      : "opponent rate"}
                  </span>
                  <Rate metric={point.defensive} />
                </div>
              </div>
              <p className="note">
                {point.factor.label}. Favorable percentile:{" "}
                {fmt(point.offensive.percentile, 1)} offense /{" "}
                {fmt(point.defensive.percentile, 1)} defense. Higher favorable
                percentile is better, including for statistics where a lower raw
                rate is better.
              </p>
              <p className="brief-film-question">
                <strong>On film:</strong> {point.factor.question}
              </p>
            </section>
          ))}
        </div>
        {!evidence.pressures.length && (
          <p className="empty">
            The available samples do not support ranked Four Factor contrasts.
          </p>
        )}
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              02 / Both directions, all the evidence
            </div>
            <h2>The possession matchup.</h2>
          </div>
        </div>
        <div className="two-col">
          {[
            [away, home],
            [home, away],
          ].map(([offense, defense]) => (
            <section
              className="paper-panel brief-factor-panel"
              key={offense.id}
            >
              <h3>{offense.name} with the ball.</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Historical rate</th>
                      <th>
                        {offense.name}
                        <small>Offense</small>
                      </th>
                      <th>
                        {defense.name}
                        <small>Defense</small>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...briefFactors.map((f) => [f.key, f.label]),
                      ["three_rate", "Three-point attempt share"],
                      ["two", "Two-point FG%"],
                      ["three", "Three-point FG%"],
                    ].map(([key, label]) => (
                      <tr key={key}>
                        <td>{label}</td>
                        <td>
                          <Rate
                            metric={offense.splits.season.metrics[`off_${key}`]}
                          />
                        </td>
                        <td>
                          <Rate
                            metric={defense.splits.season.metrics[`def_${key}`]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">
                Defense reports opponent rates, except turnovers forced. Each
                statistic pools its own valid numerators and denominators; game
                counts can differ. Three-point attempt share describes style and
                has no favorable rank.
              </p>
              <Link href={`/basketball/programs/${offense.id}/`}>
                Open {offense.name}’s full dossier →
              </Link>
            </section>
          ))}
        </div>
        <details className="brief-definitions">
          <summary>Stat definitions and denominators</summary>
          <div className="two-col">
            {briefFactors.map((factor) => (
              <p className="note" key={factor.key}>
                <strong>{factor.label}:</strong>{" "}
                {home.metrics[`off_${factor.key}`].description}
              </p>
            ))}
          </div>
          <p className="note">
            Rates are pooled from the source records, not averages of game
            percentages. Rankings compare the {d.ratings.length} programs in the
            model field. Some source games include opponents outside Division I.
          </p>
        </details>
        <div className="brief-pace">
          <h3>The pace question.</h3>
          <p>
            {away.name} recorded {fmt(away.splits.season.pace)} possessions per
            40 minutes across {away.splits.season.paired_games} paired games;{" "}
            {home.name} recorded {fmt(home.splits.season.pace)} across{" "}
            {home.splits.season.paired_games}. The adjusted forecast for this
            matchup is {fmt(p.pace)}. Identify which team’s personnel can
            dictate the first pass, early offense and transition balance; the
            historical tempo gap alone does not identify a tactical winner.
          </p>
        </div>
        <div className="paper-panel" style={{ marginTop: 24 }}>
          <div className="eyebrow">Five-v-five archive / source-native handoff</div>
          <h3>See which lineups actually shared the floor.</h3>
          <p>
            The matchup-stint archive keeps each publisher-native five-player
            group beside the opposing five, with possessions, repeat games and
            scoring margin. Search these teams to turn the factor question into
            a film assignment; the source IDs remain separate from the forecast
            and recruiting identities.
          </p>
          <div className="button-row" style={{ marginTop: 14 }}>
            <Link className="button secondary" href={`/basketball/matchup-stints/?season=2026&q=${encodeURIComponent(home.name)}`}>
              Search {home.name} lineups →
            </Link>
            <Link className="button secondary" href={`/basketball/matchup-stints/?season=2026&q=${encodeURIComponent(away.name)}`}>
              Search {away.name} lineups →
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">03 / Schedule-adjusted lens</div>
            <h2>What survives a harder schedule?</h2>
          </div>
        </div>
        <p className="note brief-explainer">
          These four-factor role estimates adjust for opponent and season
          recency using the same team-and-venue design as the efficiency model.
          A positive gap means the offense’s favorable rate is stronger than the
          opposing defense’s corresponding rate. This is a descriptive lens for
          preparation, not a new forecast or a claim about the next rotation.
        </p>
        <div className="two-col">
          {[
            [away, home],
            [home, away],
          ].map(([offense, defense]) => {
            const points = adjustedFactorPoints(offense, defense);
            return (
              <section className="paper-panel brief-factor-panel" key={offense.id}>
                <h3>{offense.name} offense vs {defense.name} defense.</h3>
                {points.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Adjusted rate</th>
                          <th>
                            {offense.name}
                            <small>Offense</small>
                          </th>
                          <th>
                            {defense.name}
                            <small>Defense</small>
                          </th>
                          <th>Favorable gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {points.map((point) => (
                          <tr key={point.factor.key}>
                            <td>{point.factor.label}</td>
                            <td className="numeric">{fmt(point.offenseValue * 100)}%</td>
                            <td className="numeric">{fmt(point.defenseValue * 100)}%</td>
                            <td className="numeric">
                              <strong>{signed(point.gap * 100)} pp</strong>
                              <small>{point.gap >= 0 ? "favors this offense" : "favors this defense"}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty">No complete adjusted-factor sample is available for this direction.</p>
                )}
                <p className="note">
                  For turnover rate, lower offensive turnover rate and higher
                  forced-turnover rate are favorable. The other rows favor more
                  efficient offense and lower opponent rates.
                </p>
              </section>
            );
          })}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              04 / Historical workload, then roster verification
            </div>
            <h2>Who carried the old possessions?</h2>
          </div>
        </div>
        <p className="note brief-explainer">
          The three largest recorded minute totals on each 2025–26 team, among
          players with at least 200 minutes. These are historical contributors,
          not a projected 2026–27 rotation. Follow the player history and verify
          availability before assigning matchups.
        </p>
        <div className="two-col">
          {evidence.programs.map(({ profile, personnel }) => (
            <section className="paper-panel brief-personnel" key={profile.id}>
              <h3>{profile.name} / 2025–26</h3>
              {personnel.map((player) => (
                <div className="brief-player" key={player.id}>
                  <div>
                    <Link
                      href={`/basketball/player/?id=${player.id}&season=${profile.season}`}
                    >
                      {player.name}
                    </Link>
                    <small>
                      {player.position || "Position unavailable"} ·{" "}
                      {player.games} games · {fmt(player.minutes, 0)} total
                      minutes
                    </small>
                  </div>
                  <div className="brief-player-stats">
                    <span>
                      <strong>{fmt(player.mpg)}</strong> MPG
                    </span>
                    <span>
                      <strong>{fmt(player.ppg)}</strong> PPG
                    </span>
                    <span>
                      <strong>
                        {player.usage_est == null
                          ? "—"
                          : fmt(player.usage_est * 100) + "%"}
                      </strong>{" "}
                      est. usage
                    </span>
                    <span>
                      <strong>
                        {player.ts == null ? "—" : fmt(player.ts * 100) + "%"}
                      </strong>{" "}
                      TS
                    </span>
                  </div>
                  <p className="note">
                    Usage sample: {player.usage_games ?? 0} games. An
                    opportunity estimate from matched minutes and boxes, not
                    measured on-court possessions.
                  </p>
                </div>
              ))}
              {!personnel.length && (
                <p className="empty">
                  No qualifying historical workloads in this profile.
                </p>
              )}
              <Link href={`/basketball/shooting/?team=${profile.id}`}>
                Inspect the historical shot map →
              </Link>
            </section>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">05 / Source roster observation</div>
            <h2>How much old workload is represented?</h2>
          </div>
          <span className="note">2026–27 listing · unconfirmed</span>
        </div>
        <p className="note brief-explainer">
          This is an exact-ID comparison between the published 2026–27 roster
          listing and recorded 2025–26 minutes. It describes what the source
          currently represents; it does not establish eligibility, availability,
          a returning decision or a projected rotation, and it does not change
          the forecast.
        </p>
        <div className="two-col">
          {evidence.programs.map(({ profile, roster }) => (
            <section className="paper-panel brief-roster" key={profile.id}>
              <h3>{profile.name}</h3>
              {roster ? (
                <>
                  <div className="rule-list">
                    <div>
                      <span>Players listed</span>
                      <strong>{roster.listed}</strong>
                    </div>
                    <div>
                      <span>Roster shape · G / F / C</span>
                      <strong>
                        {roster.positionCounts.guard} / {roster.positionCounts.forward} / {roster.positionCounts.center}
                        {roster.positionCounts.unreported
                          ? ` · ${roster.positionCounts.unreported} unreported`
                          : ""}
                      </strong>
                    </div>
                    <div>
                      <span>Listed as same program</span>
                      <strong>{roster.sameProgram}</strong>
                    </div>
                    <div>
                      <span>New to source dataset</span>
                      <strong>{roster.newToDataset}</strong>
                    </div>
                    <div>
                      <span>Returning IDs with prior minutes</span>
                      <strong>{roster.representedPlayers}</strong>
                    </div>
                    <div>
                      <span>Prior minutes represented</span>
                      <strong>
                        {roster.representedMinutes.toLocaleString()}
                        {roster.representedMinutesShare == null
                          ? ""
                          : " · " +
                            fmt(roster.representedMinutesShare * 100, 1) +
                            "%"}
                      </strong>
                    </div>
                  </div>
                  <div className="table-scroll" style={{ marginTop: 18 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Role workload</th>
                          <th className="numeric">Prior min</th>
                          <th className="numeric">Returning</th>
                          <th className="numeric">Incoming</th>
                          <th className="numeric">Unrepresented</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["guard", "forward", "center"] as const).map((group) => {
                          const workload = roster.positionWorkload[group];
                          const unrepresented = Math.max(
                            0,
                            workload.priorMinutes - workload.returningMinutes,
                          );
                          return (
                            <tr key={group}>
                              <th scope="row">
                                {group[0].toUpperCase() + group.slice(1)}
                                <small>{roster.positionCounts[group]} listed</small>
                              </th>
                              <td className="numeric">
                                {workload.priorMinutes
                                  ? Math.round(workload.priorMinutes).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="numeric">
                                {workload.returningShare == null
                                  ? "—"
                                  : `${fmt(workload.returningShare * 100, 0)}%`}
                              </td>
                              <td className="numeric">
                                {workload.incomingPriorMinutes
                                  ? Math.round(workload.incomingPriorMinutes).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="numeric">
                                {unrepresented
                                  ? Math.round(unrepresented).toLocaleString()
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="note">
                    Roster shape uses only the source-reported position labels
                    on this listing; it is descriptive and does not identify a
                    viable lineup or positional matchup.
                  </p>
                  <p className="note">
                    Role rows use prior production attached to the currently
                    listed source records. They are a narrower sample than the
                    team denominator above; a missing or unclassified listing
                    remains unknown.
                  </p>
                  <p className="note">
                    The percentage uses {roster.priorMinutes.toLocaleString()} recorded
                    2025–26 minutes for this program as its denominator. A
                    missing listing is not evidence of a departure; a new entry
                    is not proof of a freshman or transfer.
                  </p>
                </>
              ) : (
                <p className="empty">
                  No same-edition roster observation is available for this
                  profile.
                </p>
              )}
              <Link href={`/basketball/recruiting/?team=${profile.id}`}>
                Review roster observations and announcements →
              </Link>
              <Link href={`/basketball/recruiting/fit/?team=${profile.id}`}>
                Build a role shortlist for {profile.name} →
              </Link>
            </section>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">06 / Dated school evidence</div>
            <h2>What changed after those box scores?</h2>
          </div>
          <span className="note">
            Announcement board reviewed {date(recruiting.reviewed_at)}
          </span>
        </div>
        <p className="note brief-explainer">
          This board covers a limited set of schools. An announced addition does
          not by itself prove game-day availability. Later statements remain in
          the player’s timeline; a missing entry is not evidence that a player
          left or that a roster stayed unchanged.
        </p>
        <div className="two-col">
          {evidence.programs.map(({ profile, announcements, reviewed }) => (
            <section
              className="paper-panel brief-announcements"
              key={profile.id}
            >
              <h3>{profile.name}</h3>
              {announcements.length ? (
                announcements.map((person) => (
                  <div className="brief-announcement" key={person.key}>
                    <strong>{person.name}</strong>
                    <span
                      className={`brief-announcement-kind ${person.latest.kind !== "addition" ? "availability" : ""}`}
                    >
                      {eventLabels[person.latest.kind]}
                    </span>
                    <p>{person.latest.summary}</p>
                    <a href={person.latest.source.url}>
                      {person.latest.source.publisher} · published{" "}
                      {publicationDate(person.latest.source.published_on)} ↗
                    </a>
                    {person.stats && (
                      <p className="note">
                        <Link
                          href={`/basketball/player/?id=${person.stats.id}&season=${person.stats.season}`}
                        >
                          Historical production at {person.stats.team} →
                        </Link>
                      </p>
                    )}
                    <details>
                      <summary>
                        Announcement timeline · {person.timeline.length}{" "}
                        {person.timeline.length === 1
                          ? "source event"
                          : "source events"}
                      </summary>
                      {person.timeline.map((event) => (
                        <p className="note" key={event.id}>
                          <strong>{eventLabels[event.kind]}</strong> ·{" "}
                          {event.summary}{" "}
                          <a href={event.source.url}>
                            {publicationDate(event.source.published_on)} source
                            ↗
                          </a>
                        </p>
                      ))}
                    </details>
                  </div>
                ))
              ) : (
                <p>
                  {reviewed
                    ? "No reviewed same-season additions are recorded for this school in this edition."
                    : "This program is outside the reviewed school-announcement coverage in this edition. Check its official roster and availability reports."}
                </p>
              )}
              <Link
                href={`/basketball/recruiting/?q=${encodeURIComponent(profile.name)}`}
              >
                Open the recruiting evidence board →
              </Link>
            </section>
          ))}
        </div>
      </section>
      {publisherArticles.length ? (
        <section className="section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">07 / Publisher context</div>
              <h2>What the source wire is saying.</h2>
            </div>
            <Link href="/basketball/recruiting/">Open the full source wire →</Link>
          </div>
          <p className="note">These dated headlines are retained from permitted ESPN and NCAA.com RSS feeds and are shown as reporting context. They do not alter the forecast or establish an injury, eligibility, transfer or availability decision.</p>
          <div className="article-grid">
            {publisherArticles.map((article) => (
              <article className="article-card" key={article.id}>
                <div className="eyebrow">{date(article.published)} · {article.publisher || "Publisher"} RSS</div>
                <h3>{article.headline}</h3>
                <p>{article.description}</p>
                <a href={article.link} target="_blank" rel="noreferrer">Read publisher source ↗</a>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="section brief-market">
        <div className="section-heading">
          <div>
            <div className="eyebrow">08 / Compare only matching records</div>
            <h2>The forecast and market trail.</h2>
          </div>
        </div>
        <p className="note">
          Published ledger edition {date(ledger.generated_at)}. Only a record
          matching this game’s model, participants, start and prediction can
          appear here. Quotes are last qualifying observations, not verified
          closing lines or a live price feed.
        </p>
        {record ? (
          <p>
            Forecast registered <EvidenceTime value={record.registered_at} />.
            Status: <strong>{reasons[record.status] || record.status}</strong>
            {record.exclusion
              ? ` · ${reasons[record.exclusion] || record.exclusion}`
              : ""}
            .
          </p>
        ) : (
          <p>
            No matching forecast version is present in the published ledger
            snapshot. Use the game history to inspect other registrations.
          </p>
        )}
        {quotes.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bookmaker / provider</th>
                  <th>Market</th>
                  <th>Observed line / home probability</th>
                  <th>Model difference</th>
                  <th>Captured / updated</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={`${q.provider}-${q.bookmaker}-${q.market}`}>
                    <td>
                      {q.bookmaker}
                      <small>{q.provider}</small>
                    </td>
                    <td>{q.market}</td>
                    <td>
                      {q.market === "h2h"
                        ? q.market_home_probability == null
                          ? "—"
                          : fmt(q.market_home_probability * 100) + "%"
                        : fmt(q.line)}
                    </td>
                    <td>
                      {q.market === "h2h"
                        ? signed(q.model_difference * 100) + " pp"
                        : signed(q.model_difference) + " pts"}
                      <small>
                        {q.market_overround == null
                          ? "Bookmaker overround unavailable"
                          : `${fmt(q.market_overround * 100, 2)}% bookmaker overround`}
                      </small>
                    </td>
                    <td>
                      <EvidenceTime value={q.captured_at} />
                      <small>
                        Provider: <EvidenceTime value={q.updated_at} />
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            No qualifying timestamped market comparison is available for this
            forecast in this ledger edition. A model-versus-market edge cannot
            be reported.
          </p>
        )}
        <p className="note">
          For spreads, a positive difference is model home margin plus the
          observed home spread; for totals it is model total minus the line; for
          moneylines it is model home probability minus the two-way normalized
          market probability. These are model disagreements, not placed bets or
          profit estimates.
        </p>
        <Link
          href={`/research/game/?sport=basketball&id=${g.id}${record ? `&selected=${record.id}` : ""}`}
        >
          Inspect this game’s complete forecast and source history →
        </Link>
      </section>
      <p>
        <Link href={`/research/briefs/?sport=basketball&game=${g.id}`}>
          Retained reading snapshots of this brief →
        </Link>
      </p>
      <div id="brief-notes">
        <BriefNotebook
          key={`${g.id}-${d.model.id}`}
          storageKey={`silvermine-brief:${g.id}:${d.model.id}`}
          tasks={tasks}
        />
      </div>
      <footer className="brief-provenance">
        <h2>How to read this brief.</h2>
        <p>
          The preseason model’s independent 2025–26 evaluation covered{" "}
          {d.model.evaluation.games.toLocaleString()} games, with{" "}
          {fmt(d.model.evaluation.margin_mae, 2)}-point margin MAE and{" "}
          {fmt(d.model.evaluation.interval_coverage * 100)}% empirical coverage
          for nominal 80% ranges. The{" "}
          <Link href="/basketball/evaluation/">weekly model experiment</Link> is
          separate from these forecasts.
        </p>
        <p>
          Historical scouting and player statistics: {date(home.source_edition)}{" "}
          source edition. Model: <span className="mono">{d.model.id}</span>.
          Training cutoff: {d.model.cutoff}.{" "}
          <Link href="/basketball/model/">
            Model notebook and source receipts →
          </Link>
        </p>
        <p>
          Bulk observations:{" "}
          <a href="https://github.com/sportsdataverse/sportsdataverse-data">
            SportsDataverse
          </a>
          , whose publisher labels its datasets CC BY 4.0. Independent
          calculations and text templates: Silvermine. School announcements are
          linked individually. The film questions are hypotheses to verify, not
          measured descriptions of a current lineup.
        </p>
      </footer>
    </article>
  );
}
