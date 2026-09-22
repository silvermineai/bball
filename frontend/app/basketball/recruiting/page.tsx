import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Announcements from "./Announcements";
import { getArchivedRecruitingOutlook, getRecruiting, getRosters } from "../../_lib/basketball-data";
import RecruitingWire from "./RecruitingWire";
import AuthorizedIntake from "./AuthorizedIntake";
import MovementWatch from "./MovementWatch";
import RecruitingBoard from "./RecruitingBoard";
import LiveBasketballRecruitingStatus from "../../_components/LiveBasketballRecruitingStatus";
import LiveBasketballProspectStatus from "../../_components/LiveBasketballProspectStatus";
import {
  eventLabels,
  recruitingProductionEvidenceCoverage,
  recruitingProductionDifference,
  recruitingRosterProductionComparisons,
  type RecruitingRelease,
  type RecruitingRosterProductionPlayer,
} from "../../_lib/recruiting";
import { fmt } from "../../_lib/format";
import { comparisonParams } from "../../_lib/player-comparison";
import { publicArchiveArticle } from "../../_lib/public-text";
import type { ProspectProgram } from "../../_lib/prospect-schools";
import RecruitingCoverageBoundary from "../../_components/RecruitingCoverageBoundary";
import { assessRecruitingCoverage } from "../../_lib/recruiting-coverage";
import ArchivedTeamOutlook from "./ArchivedTeamOutlook";
import TransferProductionBoard from "./TransferProductionBoard";

function ProductionEvidence({ player }: { player: RecruitingRosterProductionPlayer | null }) {
  if (!player) return <span className="note">No recorded player in this evidence set</span>;
  const name = player.player_id && player.season
    ? <Link href={`/basketball/player/?id=${encodeURIComponent(player.player_id)}&season=${player.season}`}>{player.name}</Link>
    : player.name;
  const coverage = recruitingProductionEvidenceCoverage(player);
  const values = [
    player.mpg == null ? null : `${fmt(player.mpg)} MPG`,
    player.ppg == null ? null : `${fmt(player.ppg)} PPG`,
    player.rpg == null ? null : `${fmt(player.rpg)} RPG`,
    player.apg == null ? null : `${fmt(player.apg)} APG`,
    player.ts == null ? null : `${fmt(player.ts * 100)}% TS`,
  ].filter((value): value is string => value != null);
  return <>
    <strong>{name}</strong>
    <small>{player.prior_team || "Prior program unavailable"} · {player.player_id ? `ID ${player.player_id}` : "Historical player ID unavailable"}</small>
    {values.length ? <small>{values.join(" · ")}</small> : <small>Prior production unavailable</small>}
    <small>{coverage.available}/{coverage.total} production fields recorded{player.games == null ? " · games unavailable" : ` · ${player.games} games`}</small>
  </>;
}
export const metadata = {
  title: "Basketball recruiting: rankings, movement and player production",
  description:
    "Search prospect rankings alongside player production, roster movement, dated additions and coverage labels.",
  alternates: { canonical: "/basketball/recruiting/" },
};
export default function Page() {
  const rawData = getRecruiting();
  const archivedTeamOutlook = getArchivedRecruitingOutlook();
  const rosters = getRosters();
  const programDirectory = (JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/teams.json"), "utf8"),
  ) as { teams?: Array<{ id: string | number; name: string; shortName?: string | null }> }).teams
    ?.map((program) => ({
      id: String(program.id),
      name: program.name,
      shortName: program.shortName || null,
    } satisfies ProspectProgram)) || [];
  // Keep the retained evidence and hashes in the private archive/API, while
  // keeping provider URLs out of the public page payload and initial HTML.
  const data = JSON.parse(JSON.stringify(rawData, (key, value) => {
    if (key === "url" || key === "source_url" || key === "link" || key === "host" || key === "publisher") return undefined;
    return typeof value === "string"
      ? value.replace(/https?:\/\/[^\s"'<>]+/gi, "archived media")
      : value;
  })) as RecruitingRelease;
  const news = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/news.json"), "utf8"),
  ) as {
    generated_at?: string;
    attribution?: { terms?: string; method?: string };
    articles: {
      id: string;
      headline: string;
      description: string;
      published: string;
      link: string;
      categories: string[];
      publisher?: string;
      sport?: string;
    }[];
  };
  const recruitingNews = news.articles.filter((article) =>
      (article.sport === "mens-college-basketball" || article.categories.some((category) => /NCAA Men's Basketball/i.test(category))) &&
      /recruit|transfer|portal|commit|sign|class of|prospect|injur|surgery|\bout\b|miss(?:es|ing)?(?:\s+the)?\s+season|unavailable|return to play/i.test(
        `${article.headline} ${article.description} ${article.categories.join(" ")}`,
      ),
    ).map(publicArchiveArticle);
  const productionComparisons = recruitingRosterProductionComparisons(data, rosters);
  const recruitingCoverage = assessRecruitingCoverage({
    coverage: data.coverage,
    peopleCount: data.people.length,
    eventCount: data.events.length,
    sourceCount: data.sources.length,
    directoryProgramCount: programDirectory.length,
  });
  const continuityRows = (rosters.team_summaries || [])
    .filter((row) => row.represented_prior_minutes > 0)
    .sort((a, b) => b.represented_prior_minutes - a.represented_prior_minutes || a.team.localeCompare(b.team))
    .slice(0, 20);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          Recruiting board / 2026–27
        </div>
        <h1>
          Find the signal.
          <br />
          Keep the numbers.
        </h1>
        <p>
          Rankings, prior college production, roster movement and class
          destinations in one filterable board. Every row keeps its season,
          identity and coverage status attached.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/ncaa-rosters/">Search roster intel ↗</Link>
          <Link className="button secondary" href="/basketball/roster-lab/">Compare roster workload ↗</Link>
          <Link className="button secondary" href="/basketball/roster-board/">Rank roster workload ↗</Link>
          <Link className="button secondary" href="/basketball/recruiting/fit/">Build a role shortlist ↗</Link>
          <Link className="hero-link" href="/basketball/ncaa-rankings/">Rank recorded production →</Link>
        </div>
      </div>
      <section className="stat-strip" aria-label="Recruiting coverage">
        <div><strong>{data.coverage.players.toLocaleString()}</strong><span>Recorded people</span></div>
        <div><strong>{data.coverage.programs.toLocaleString()}</strong><span>Programs reviewed</span></div>
        <div><strong>{data.coverage.events.toLocaleString()}</strong><span>Dated events</span></div>
        <div><strong>{data.coverage.historical_links.toLocaleString()}</strong><span>Prior stat links</span></div>
      </section>
      <LiveBasketballRecruitingStatus />
      <LiveBasketballProspectStatus />
      <RecruitingCoverageBoundary
        assessment={recruitingCoverage}
        edition={data.edition}
        counts={{
          players: data.coverage.players,
          events: data.coverage.events,
          sources: data.coverage.sources,
          historicalLinks: data.coverage.historical_links,
        }}
      />
      <section className="section" aria-labelledby="roster-continuity">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Roster model / 2026–27</div>
            <h2 id="roster-continuity">Where prior workload is represented</h2>
          </div>
          <Link href="/basketball/roster-board/">Open the full roster board →</Link>
        </div>
        <p className="note">Top programs by prior minutes represented in the retained roster identity map. This is continuity evidence, not an eligibility ruling or depth chart.</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Program</th><th className="numeric">Listed</th><th className="numeric">Returning</th><th className="numeric">New</th><th className="numeric">Prior min.</th><th className="numeric">Represented min.</th><th className="numeric">Represented share</th></tr></thead>
            <tbody>{continuityRows.map((row) => <tr key={row.team_id}>
              <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(row.team_id)}/`}>{row.team}</Link><small>{row.returning_players} returning · {row.transfer_players} transfers</small></th>
              <td className="numeric">{row.listed_players}</td>
              <td className="numeric">{row.returning_players}</td>
              <td className="numeric">{row.new_players}</td>
              <td className="numeric">{fmt(row.prior_minutes, 0)}</td>
              <td className="numeric"><strong>{fmt(row.represented_prior_minutes, 0)}</strong></td>
              <td className="numeric">{row.represented_prior_minutes_share == null ? "—" : `${fmt(row.represented_prior_minutes_share * 100, 1)}%`}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <ArchivedTeamOutlook release={archivedTeamOutlook} />
      <TransferProductionBoard people={data.people} programs={programDirectory} rosters={rosters} edition={data.edition} reviewedAt={data.reviewed_at} />
      <section className="section" aria-labelledby="recruiting-production">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Recruiting / production bridge</div>
            <h2 id="recruiting-production">Incoming production beside the returning core.</h2>
          </div>
          <Link href="/basketball/roster-board/">Open the full workload board →</Link>
        </div>
        <p className="note">For every reviewed program, this pairs the highest-workload addition with the highest-workload same-program returner. Players are joined only through recorded program and player IDs. An unavailable ID or stat stays unavailable; the pair is a study starting point, not a depth-chart or eligibility judgment.</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Program</th><th>Incoming workload leader</th><th>Returning workload leader</th><th className="numeric">MPG difference</th><th className="numeric">PPG difference</th><th>Player files</th></tr></thead>
            <tbody>{productionComparisons.map((row) => {
              const minutesDifference = recruitingProductionDifference(row.incoming?.mpg, row.returning?.mpg);
              const scoringDifference = recruitingProductionDifference(row.incoming?.ppg, row.returning?.ppg);
              const comparison = row.incoming?.player_id && row.incoming.prior_team_id && row.incoming.season && row.returning?.player_id && row.returning.prior_team_id && row.returning.season
                ? `/basketball/compare-players/?${comparisonParams([
                    { season: row.incoming.season, id: row.incoming.player_id, team_id: row.incoming.prior_team_id },
                    { season: row.returning.season, id: row.returning.player_id, team_id: row.returning.prior_team_id },
                  ], "perGame")}`
                : null;
              return <tr key={row.team_id}>
                <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(row.team_id)}/`}>{row.team_name}</Link><small>{row.incoming_players} reviewed additions · {row.incoming_linked} with prior production</small><small>{row.returning_players} same-program players · {row.returning_linked} with prior production</small></th>
                <td><ProductionEvidence player={row.incoming} /><small>{row.incoming ? eventLabels[row.incoming.availability as keyof typeof eventLabels] : "Addition unavailable"}</small></td>
                <td><ProductionEvidence player={row.returning} /><small>{row.returning ? "Exact same-program player ID" : "Returning evidence unavailable"}</small></td>
                <td className="numeric"><strong>{minutesDifference == null ? "—" : `${minutesDifference > 0 ? "+" : ""}${fmt(minutesDifference)} min`}</strong><small>{minutesDifference == null ? "Requires both MPG values" : "incoming minus returning"}</small></td>
                <td className="numeric"><strong>{scoringDifference == null ? "—" : `${scoringDifference > 0 ? "+" : ""}${fmt(scoringDifference)} PPG`}</strong><small>{scoringDifference == null ? "Requires both PPG values" : "incoming minus returning"}</small></td>
                <td>{comparison ? <Link href={comparison}>Compare exact player files →</Link> : <span className="note">Comparison unavailable</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
      <RecruitingWire articles={recruitingNews} />
      <MovementWatch />
      <RecruitingBoard programs={programDirectory} />
      <AuthorizedIntake />
      <section className="section recruiting-context">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Data notes / coverage</div>
            <h2>Read the board with its limits.</h2>
          </div>
          <p>
            Movement and availability labels describe recorded observations.
            They do not infer eligibility, a commitment or a future role.
          </p>
        </div>
        <div className="two-col">
          <article className="paper-panel">
            <div className="eyebrow">Coverage</div>
            <h3>What is on the board?</h3>
            <p>
              This edition includes {data.coverage.players.toLocaleString()} people,
              {" "}{data.coverage.events.toLocaleString()} dated events and
              {" "}{data.coverage.historical_links.toLocaleString()} links to prior
              college production across {data.coverage.programs.toLocaleString()} programs.
            </p>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">Interpretation</div>
            <h3>Production stays attached.</h3>
            <p>
              Prior games, minutes, scoring, rebounding, playmaking and
              shooting rates stay beside the player row so recruiting views
              remain measurable instead of editorial.
            </p>
          </article>
        </div>
        <p className="section-note">
          A missing event or stat link means the board has no retained record
          for that field; it does not imply that no movement occurred.
        </p>
      </section>
      <Announcements data={data} />
    </>
  );
}
