import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBasketball,
  getBasketballShootingSeason,
  getRecruiting,
  getRosterModel,
  getRosters,
} from "../../../_lib/basketball-data";
import { getScoutProfile } from "../../../_lib/scouting-data";
import { getLedger } from "../../../_lib/research-data";
import { date, fmt, kick, signed } from "../../../_lib/format";
import { publicArchiveText } from "../../../_lib/public-text";
import {
  adjustedFactorPoints,
  briefEvidence,
  briefFactors,
  briefScenarioUrl,
  headToHeadSummary,
  matchingBriefRosterScenario,
  rosterEvidenceReadiness,
} from "../../../_lib/matchup-brief";
import { eventLabels, publicationDate } from "../../../_lib/recruiting";
import { reasons } from "../../../_lib/research-types";
import type { Metric, ScoutProfile } from "../../../_lib/scouting-types";
import BriefNotebook from "../BriefNotebook";
import ManualMarketCheck from "../ManualMarketCheck";
import LiveBriefForecastStatus from "../LiveBriefForecastStatus";
import LiveBriefMarketTrail from "../LiveBriefMarketTrail";
import { buildNotebookShotPrep } from "../../../blog/notebook-shot-prep";
import BriefLineupEvidence from "../BriefLineupEvidence";
import { buildFactorPersonnelQuestions } from "../../../_lib/factor-personnel-questions";
import { buildPreparationChecklist } from "../../../_lib/preparation-checklist";
import { explainBasketballPrediction } from "../../../_lib/basketball-prediction-explanation";
import { basketballCalibrationContext } from "../../../_lib/basketball-calibration";
import { readPublishedCalibration } from "../../model/ForecastCalibrationTable";
import { buildBriefAnalysisPacket } from "../../../_lib/brief-analysis-packet";
import MatchupRecruitingContext from "./MatchupRecruitingContext";
import RotationWatchPanel from "../../../_components/RotationWatchPanel";

const emptySplit = () => ({
  games: 0,
  scored_games: 0,
  paired_games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  pace: null,
  close_games: 0,
  close_wins: 0,
  sos: null,
  sos_games: 0,
  metrics: Object.fromEntries(
    ["efg", "tov", "orb", "ftr"].flatMap((key) => [
      [`off_${key}`, { value: null, games: 0, description: "No historical profile is available for this program in the published edition." }],
      [`def_${key}`, { value: null, games: 0, description: "No historical profile is available for this program in the published edition." }],
    ]),
  ) as Record<string, Metric>,
});

function loadBriefProfile(id: string, name: string, overview: ReturnType<typeof getBasketball>): ScoutProfile {
  try {
    return getScoutProfile(id);
  } catch {
    // Cold-start forecasts can include programs without a full historical dossier.
    const split = emptySplit();
    return {
      id,
      name,
      season: overview.season - 1,
      rating: {} as ScoutProfile["rating"],
      splits: { season: split, last10: split, last5: split, home: split, road: split, neutral: split, top50: split },
      games: [],
      players: [],
      upcoming: [],
      forecast_season: overview.season,
      generated_at: overview.generated_at,
      source_edition: overview.generated_at,
      model_id: overview.model.id,
      metrics: Object.fromEntries(
        ["efg", "tov", "orb", "ftr"].flatMap((key) => [
          [`off_${key}`, { label: key, format: "percent", higher_better: null, description: "No historical profile is available for this program in the published edition." }],
          [`def_${key}`, { label: key, format: "percent", higher_better: null, description: "No historical profile is available for this program in the published edition." }],
        ]),
      ),
    };
  }
}

export function generateStaticParams() {
  return getBasketball()
    .upcoming.filter((g) => g.prediction || g.fallback_prediction)
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
    .map((article) => ({
      ...article,
      headline: publicArchiveText(article.headline),
      description: publicArchiveText(article.description),
    }))
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
    p = g?.prediction || g?.fallback_prediction;
  if (!g || !p) notFound();
  const home = loadBriefProfile(g.home_id, g.home_name, d),
    away = loadBriefProfile(g.away_id, g.away_name, d),
    recruiting = getRecruiting(),
    rosters = getRosters(),
    ledger = getLedger(),
    rosterModel = getRosterModel();
  const evidence = briefEvidence(g, d, home, away, recruiting, ledger, rosters),
    headToHead = headToHeadSummary(home, away),
    favorite = p.home_margin >= 0 ? g.home_name : g.away_name;
  const predictionExplanation = explainBasketballPrediction(d.model, g, p);
  const calibrationContext = basketballCalibrationContext(
    p.home_win_probability,
    readPublishedCalibration(d.model.id),
  );
  const rosterScenario = matchingBriefRosterScenario(g, p, rosterModel, d.model.id);
  const shotSeason = d.season - 1;
  const shotProfiles = getBasketballShootingSeason(shotSeason)?.players || [];
  const shotPrep = evidence.programs.map(({ profile, personnel }) => ({
    profile,
    rows: buildNotebookShotPrep(profile.id, personnel, shotProfiles, shotSeason),
  }));
  const shotPrepCount = shotPrep.reduce((sum, group) => sum + group.rows.length, 0);
  const factorPersonnel = buildFactorPersonnelQuestions(
    evidence.pressures,
    evidence.programs.map(({ profile, personnel }) => ({ profile, personnel })),
  );
  const tasks = buildPreparationChecklist({
    pressureLabels: evidence.pressures.map((point) => point.factor.label),
    shotPrepCount,
    factorPersonnelCount: factorPersonnel.length,
    forecastType: p.estimate_type === "cold_start" ? "cold_start" : "primary",
    marginLow: p.margin_low,
    marginHigh: p.margin_high,
  });
  const record = evidence.ledger,
    quotes = record && !record.exclusion ? record.comparisons : [],
    publisherArticles = relatedPublisherArticles(g),
    rosterReadiness = rosterEvidenceReadiness(evidence.programs),
    marginWidth = p.margin_high - p.margin_low,
    analysisPacket = buildBriefAnalysisPacket({
      prediction: p,
      modelId: d.model.id,
      forecastModelId: g.forecast_model_id,
      coefficientReproduced: Boolean(predictionExplanation),
      startsAt: g.starts_at,
      timeTbd: g.time_tbd,
      venue: g.venue,
      neutral: g.neutral,
      factorCount: evidence.pressures.length,
      roster: rosterReadiness,
      marketQuoteCount: quotes.length,
    }),
    readiness = [
      {
        key: "forecast",
        label: "Forecast signal",
        value: p.estimate_type === "cold_start" ? "Cold start" : "Model baseline",
        detail:
          p.estimate_type === "cold_start"
            ? "One or both teams lack a full historical profile; treat the prior as a wider starting point."
            : `Home win estimate ${fmt(p.home_win_probability * 100)}% · ${fmt(marginWidth, 1)}-point nominal range.`,
        href: "/basketball/model/",
        link: "Model notebook",
        tone: p.estimate_type === "cold_start" ? "caution" : "ink",
      },
      {
        key: "schedule",
        label: "Schedule status",
        value: g.time_tbd ? "Start time unconfirmed" : g.neutral ? "Neutral floor" : "Home floor",
        detail: g.time_tbd
          ? "The source schedule has not confirmed a tip time; recheck before distributing a plan."
          : g.venue || "Venue designation is available from the schedule source.",
        href: `/research/game/?sport=basketball&id=${g.id}`,
        link: "Open schedule record",
        tone: g.time_tbd ? "caution" : "ink",
      },
      {
        key: "roster",
        label: "Roster evidence",
        value: rosterReadiness.label,
        detail: rosterReadiness.teams
          .map((team) => {
            if (team.listed == null) return `${team.name}: no roster observation`;
            return `${team.name}: ${team.listed} players listed · ${team.representedMinutesShare == null ? "prior-minute share unavailable" : `${fmt(team.representedMinutesShare * 100, 0)}% prior minutes represented`}`;
          })
          .join(" · "),
        href: "#roster-evidence",
        link: "Roster evidence",
        tone: rosterReadiness.state === "complete" ? "ink" : "caution",
      },
      {
        key: "market",
        label: "Market evidence",
        value: quotes.length ? `${quotes.length} timestamped comparison${quotes.length === 1 ? "" : "s"}` : "No licensed quote",
        detail: quotes.length
          ? "The comparison is matched to this model edition and game snapshot."
          : "No qualifying market observation is published; an edge cannot be reported.",
        href: "#market-trail",
        link: quotes.length ? "Market trail" : "Record a manual check",
        tone: quotes.length ? "ink" : "muted",
      },
    ];
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
        </div>
      </header>
      <section className="brief-scoreboard" aria-label="Model forecast">
        <div>
          <span>{g.away_name}</span>
          <strong>{fmt(p.away_score)}</strong>
          <small>Projected away score</small>
        </div>
        <div className="brief-score-center">
          <span>{p.estimate_type === "cold_start" ? "Cold-start estimate" : "Preseason baseline"}</span>
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
          Projected total <strong>{fmt(p.total)}</strong>.{" "}
          {p.total_low != null && p.total_high != null
            ? <>Calibrated total range: <strong>{fmt(p.total_low)} to {fmt(p.total_high)}</strong>.{" "}</>
            : <>An independent total range is unavailable for this model edition.{" "}</>}Nominal 80% range for
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
      <section className="section paper-panel brief-calibration-panel" aria-labelledby="brief-calibration-context">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Held-out calibration / exact edition</div>
            <h2 id="brief-calibration-context">How often does this probability band land?</h2>
          </div>
          <span className="note">Model {d.model.id}</span>
        </div>
        {calibrationContext ? (
          <>
            <div className="strip" aria-label="Held-out probability context">
              <div><strong>{calibrationContext.side} {fmt(calibrationContext.confidence_lower * 100, 0)}–{fmt(calibrationContext.confidence_upper * 100, 0)}%</strong><span>Historical probability band</span></div>
              <div><strong>{calibrationContext.games.toLocaleString()}</strong><span>Held-out games</span></div>
              <div><strong>{calibrationContext.observed == null ? "—" : `${fmt(calibrationContext.observed * 100, 1)}%`}</strong><span>Observed win rate</span></div>
              <div><strong>{calibrationContext.observed_gap_pp == null ? "—" : `${calibrationContext.observed_gap_pp >= 0 ? "+" : ""}${fmt(calibrationContext.observed_gap_pp, 1)} pp`}</strong><span>Observed minus predicted</span></div>
            </div>
            <p className="note" style={{ marginTop: 14 }}>This is chronological holdout context for the model&apos;s probability band, not a game-specific confidence guarantee. The panel is shown only when the evaluation replay names the same production model edition as this brief.</p>
          </>
        ) : <p className="empty">The exact-edition held-out calibration replay is unavailable, so no historical hit rate is attached to this forecast.</p>}
      </section>
      <section className="section" aria-labelledby="brief-model-equation">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Model transparency / published equation</div>
            <h2 id="brief-model-equation">How the model gets the score.</h2>
          </div>
          <span className="note">Edition matched</span>
        </div>
        {predictionExplanation ? (
          <>
            <p className="note brief-explainer">
              The published forecast rebuilds each score from the league baseline,
              each team&apos;s offense, the opponent&apos;s defense, and the venue
              adjustment. These are the exact coefficient terms behind this game,
              not a second forecast or a hand-written explanation.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Published term</th>
                    <th className="numeric">{g.away_name}</th>
                    <th className="numeric">{g.home_name}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">League baseline</th>
                    <td className="numeric">{fmt(predictionExplanation.away.league, 2)}</td>
                    <td className="numeric">{fmt(predictionExplanation.home.league, 2)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Team offense</th>
                    <td className="numeric">{signed(predictionExplanation.away.ownOffense, 2)}</td>
                    <td className="numeric">{signed(predictionExplanation.home.ownOffense, 2)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Opponent defense</th>
                    <td className="numeric">{signed(predictionExplanation.away.opponentDefense, 2)}</td>
                    <td className="numeric">{signed(predictionExplanation.home.opponentDefense, 2)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Venue adjustment</th>
                    <td className="numeric">{signed(predictionExplanation.away.venue, 2)}</td>
                    <td className="numeric">{signed(predictionExplanation.home.venue, 2)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Modeled efficiency</th>
                    <td className="numeric">{fmt(predictionExplanation.away.efficiency, 2)}</td>
                    <td className="numeric">{fmt(predictionExplanation.home.efficiency, 2)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Projected score</th>
                    <td className="numeric"><strong>{fmt(predictionExplanation.away.projectedScore, 2)}</strong></td>
                    <td className="numeric"><strong>{fmt(predictionExplanation.home.projectedScore, 2)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="note">
              Shared pace baseline: <strong>{fmt(predictionExplanation.paceBaseline, 2)} possessions</strong>.
              The equation is shown only when the coefficient edition reproduces
              the published score within rounding tolerance.
            </p>
          </>
        ) : (
          <p className="empty">
            The coefficient archive does not reproduce this forecast edition, so
            the component terms are withheld rather than inferred.
          </p>
        )}
      </section>
      <LiveBriefForecastStatus gameId={g.id} staticEdition={d.generated_at} staticModelId={d.model.id} staticPrediction={p} />
      <section className="section" aria-labelledby="brief-roster-sensitivity">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Roster continuity / sensitivity lens</div>
            <h2 id="brief-roster-sensitivity">What changes if recorded continuity holds?</h2>
          </div>
          <span className="note">Research scenario</span>
        </div>
        {rosterScenario ? (
          <>
            <p className="note brief-explainer">
              This scenario uses exact source-athlete IDs and prior recorded
              minutes from the matching roster release. It reuses the primary
              edition&apos;s calibration to show sensitivity; it does not replace
              the published forecast or establish availability.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Roster lens</th><th className="numeric">Primary forecast</th><th className="numeric">Continuity scenario</th><th className="numeric">Change</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Home margin</th>
                    <td className="numeric">{signed(p.home_margin)}</td>
                    <td className="numeric">{signed(rosterScenario.roster_margin)}</td>
                    <td className="numeric">{signed(rosterScenario.margin_delta)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Home win probability</th>
                    <td className="numeric">{fmt(p.home_win_probability * 100)}%</td>
                    <td className="numeric">{fmt(rosterScenario.roster_home_win_probability * 100)}%</td>
                    <td className="numeric">{signed((rosterScenario.roster_home_win_probability - p.home_win_probability) * 100)} pp</td>
                  </tr>
                  <tr>
                    <th scope="row">Margin range</th>
                    <td className="numeric">{signed(p.margin_low)} to {signed(p.margin_high)}</td>
                    <td className="numeric">{signed(rosterScenario.roster_margin_low)} to {signed(rosterScenario.roster_margin_high)}</td>
                    <td className="numeric">{signed((rosterScenario.roster_margin_high - rosterScenario.roster_margin_low) - (p.margin_high - p.margin_low))} pts width</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="note">
              Scenario model edition: <span className="mono">{rosterScenario.primary_model_id}</span> · base margin check passed against this brief.
            </p>
            <RotationWatchPanel scenario={rosterScenario} awayName={g.away_name} homeName={g.home_name} priorSeason={d.season - 1} />
          </>
        ) : (
          <p className="empty">
            No exact-edition continuity scenario is published for this game;
            roster evidence remains descriptive and does not alter the forecast.
          </p>
        )}
      </section>
      <MatchupRecruitingContext
        homeId={g.home_id}
        homeName={g.home_name}
        awayId={g.away_id}
        awayName={g.away_name}
        productionPeople={recruiting.people}
        productionSeason={recruiting.season}
      />
      <section className="section brief-analysis-packet" aria-labelledby="brief-analysis-packet-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Analysis packet / exact game</div>
            <h2 id="brief-analysis-packet-title">
              {analysisPacket.state === "ready"
                ? "Evidence packet ready for review."
                : analysisPacket.state === "blocked"
                  ? "Evidence packet blocked by an integrity check."
                  : "Evidence packet is partial; read the gaps first."}
            </h2>
          </div>
          <span className="note">
            {analysisPacket.verifiedCount}/{analysisPacket.items.length} lanes verified
          </span>
        </div>
        <p className="note brief-explainer">
          This packet separates what the published game record supports from
          inputs that are missing or descriptive only. Missing evidence stays
          visible, so a forecast cannot be mistaken for a current availability
          report or a market recommendation.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Evidence lane</th>
                <th>Status</th>
                <th>Observed in this brief</th>
                <th>Missing before use</th>
              </tr>
            </thead>
            <tbody>
              {analysisPacket.items.map((entry) => (
                <tr key={entry.key}>
                  <th scope="row">{entry.label}</th>
                  <td>
                    <span className={`readiness-state ${entry.state === "verified" ? "readiness-state-ready" : entry.state === "blocked" ? "readiness-state-blocked" : "readiness-state-missing"}`}>
                      {entry.state === "verified" ? "Verified" : entry.state === "partial" ? "Partial" : entry.state === "blocked" ? "Blocked" : "Unavailable"}
                    </span>
                  </td>
                  <td>{entry.observed}</td>
                  <td>{entry.missing || "None recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note brief-readiness-note">
          The packet is an evidence boundary for preparation. It does not infer
          eligibility, injuries, rotations, closing lines or player roles from
          absent data.
        </p>
      </section>
      <section className="brief-readiness" aria-label="Pre-tip readiness">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Pre-tip readiness / Four checks</div>
            <h2>Know what is settled before you scout.</h2>
          </div>
          <span className="note">Updated with this brief edition</span>
        </div>
        <div className="brief-readiness-grid">
          {readiness.map((item) => (
            <div className={`brief-readiness-card ${item.tone}`} key={item.key}>
              <div className="eyebrow">{item.label}</div>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
              <Link href={item.href}>{item.link} →</Link>
            </div>
          ))}
        </div>
        <p className="note brief-readiness-note">
          These checks describe source coverage and model state. They do not
          convert a roster listing into eligibility, a schedule into availability,
          or a market quote into a recommendation.
        </p>
      </section>
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
      <section className="section" id="roster-evidence">
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
              {(() => {
                const personnel = factorPersonnel.find(
                  (row) => row.key === `${point.offense}:${point.defense}:${point.factor.key}`,
                );
                return personnel ? (
                  <p className="brief-film-question">
                    <strong>Personnel check:</strong>{" "}
                    <Link href={personnel.playerHref}>{personnel.player.name}</Link>{" "}
                    ({personnel.metricLabel} {personnel.metricText}; {personnel.sampleText}). {personnel.question}
                  </p>
                ) : null;
              })()}
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
        <BriefLineupEvidence homeName={home.name} awayName={away.name} season={d.season - 1} />
      </section>
      <section className="section" aria-label="Prior meetings">
        <div className="section-heading">
          <div>
            <div className="eyebrow">03 / Prior meetings / exact source IDs</div>
            <h2>What happened when these programs met?</h2>
          </div>
          <span className="note">2025–26 source schedule</span>
        </div>
        <p className="note brief-explainer">
          This is a descriptive look at completed meetings where the home and
          away source team IDs matched exactly in the scouting archive. It is
          context for preparation, not a head-to-head forecast; a missing row
          means this source edition did not retain a qualifying meeting.
        </p>
        {headToHead.total ? (
          <>
            <div className="strip">
              <div><strong>{headToHead.total}</strong><span>Recorded meetings</span></div>
              <div><strong>{headToHead.wins}–{headToHead.losses}{headToHead.ties ? `–${headToHead.ties}` : ""}</strong><span>{home.name} record</span></div>
              <div><strong>{headToHead.averageMargin == null ? "—" : signed(headToHead.averageMargin)}</strong><span>Average {home.name} margin</span></div>
              <div><strong>{date(headToHead.games[0]?.starts_at || "")}</strong><span>Latest shown</span></div>
            </div>
            <div className="table-scroll" style={{ marginTop: 18 }}>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Location</th><th className="numeric">Score</th><th>Result</th><th className="numeric">Margin</th><th>Evidence</th></tr></thead>
                <tbody>{headToHead.games.map((game) => <tr key={game.id}>
                  <td>{date(game.starts_at)}<small>Game {game.id}</small></td>
                  <td>{game.location === "home" ? `${home.name} home` : game.location === "road" ? `${home.name} road` : "Neutral"}</td>
                  <td className="numeric">{game.score}–{game.allowed}</td>
                  <td>{game.result || "—"}</td>
                  <td className="numeric">{game.score != null && game.allowed != null ? signed(game.score - game.allowed) : "—"}</td>
                  <td>Recorded game row</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>
        ) : <p className="empty">No completed exact-ID meetings are available in this source edition.</p>}
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">04 / Schedule-adjusted lens</div>
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
              05 / Historical workload, then roster verification
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
      {shotPrepCount > 0 && (
        <section className="section" aria-labelledby="brief-shot-prep">
          <div className="section-heading">
            <div>
              <div className="eyebrow">05A / Personnel → shot map</div>
              <h2 id="brief-shot-prep">Give the factor edge a film assignment.</h2>
            </div>
            <Link href="/basketball/shooting/">Open the shooting lab →</Link>
          </div>
          <p className="note brief-explainer">
            These rows join the historical contributors above to the retained
            Retained shot archive by exact player and team ID. Attempt and located
            counts stay visible so the question follows the evidence. This is
            historical preparation context, not a projected rotation or a
            forecast input.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Program / player</th>
                  <th>Recorded shot evidence</th>
                  <th>Question for film</th>
                  <th>Drill-down</th>
                </tr>
              </thead>
              <tbody>
                {shotPrep.flatMap(({ profile, rows }) =>
                  rows.map((row) => (
                    <tr key={`${profile.id}-${row.player.id}`}>
                      <th scope="row">
                        <Link href={`/basketball/player/?id=${encodeURIComponent(row.player.id)}&season=${row.player.season}`}>
                          {row.player.name}
                        </Link>
                        <small>{profile.name} · {row.player.position || "Position unavailable"}</small>
                      </th>
                      <td>
                        {row.evidence}
                        <small>{row.profile.name === row.player.name ? "Exact archive name" : `Archive label: ${row.profile.name}`}</small>
                      </td>
                      <td>{row.question}</td>
                      <td><Link className="button secondary" href={row.mapHref}>View court map ↗</Link></td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p className="note">
            Located coordinates are a subset of matched attempts. Missing
            locations remain in the attempt denominator and are not imputed.
          </p>
        </section>
      )}
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">06 / Source roster observation</div>
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
            <div className="eyebrow">07 / Dated school evidence</div>
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
                    <span className="note">Recorded {publicationDate(person.latest.source.published_on)} · retained announcement</span>
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
                          {person.timeline.length === 1 ? "recorded event" : "recorded events"}
                      </summary>
                      {person.timeline.map((event) => (
                        <p className="note" key={event.id}>
                          <strong>{eventLabels[event.kind]}</strong> ·{" "}
                          {event.summary}{" "}
                          <span>{publicationDate(event.source.published_on)} · retained event</span>
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
              <div className="eyebrow">08 / Reporting context</div>
              <h2>Recent context around the matchup.</h2>
            </div>
            <Link href="/basketball/recruiting/">Open the full source wire →</Link>
          </div>
          <p className="note">These dated headlines are retained as context. They do not alter the forecast or establish an injury, eligibility, transfer or availability decision.</p>
          <div className="article-grid">
            {publisherArticles.map((article) => (
              <article className="article-card" key={article.id}>
                <div className="eyebrow">{date(article.published)} · retained report</div>
                <h3>{article.headline}</h3>
                <p>{article.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="section brief-market" id="market-trail">
        <div className="section-heading">
          <div>
            <div className="eyebrow">09 / Compare only matching records</div>
            <h2>The forecast and market trail.</h2>
          </div>
        </div>
        <p className="note">
          Published ledger edition {date(ledger.generated_at)}. Only a record
          matching this game’s model, participants, start and prediction can
          appear here. Quotes are last qualifying observations, not verified
          closing lines or a live price feed.
        </p>
        <LiveBriefMarketTrail gameId={g.id} />
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
                  <th>Market quote</th>
                  <th>Market</th>
                  <th>Observed line / home probability</th>
                  <th>Model difference</th>
                  <th>Captured / updated</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={`${q.provider}-${q.bookmaker}-${q.market}`}>
                    <td><strong>Verified line</strong><small>Captured market quote</small></td>
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
                          : `${fmt(q.market_overround * 100, 2)}% market margin`}
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
          Bulk observations are retained with edition hashes. Independent
          calculations and text templates: Silvermine. School announcements are
          kept as timeline evidence. The film questions are hypotheses to
          verify, not measured descriptions of a current lineup.
        </p>
      </footer>
    </article>
  );
}
