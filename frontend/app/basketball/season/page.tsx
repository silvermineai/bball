import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { espnGameUrl } from "../../_lib/basketball-data";

type GameRow = {
  id: number;
  date: string;
  home: string;
  homeId: number;
  homeLogo: string | null;
  homeScore: number;
  away: string;
  awayId: number;
  awayLogo: string | null;
  awayScore: number;
  venue: string | null;
  note: string | null;
  attendance: number | null;
  homeRank: number | null;
  awayRank: number | null;
  srsGap?: number;
};
type Champion = {
  conference: string;
  strengthRank: number;
  id: number;
  name: string;
  shortName: string;
  logo: string | null;
  confRecord: string | null;
  record: string | null;
  srsRank: number | null;
};
type SeasonReviewData = {
  season: string;
  upsets: GameRow[];
  thrillers: GameRow[];
  champions: Champion[];
  biggestCrowds: GameRow[];
};

const seasonData = (): SeasonReviewData => JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/data/season_review.json"), "utf8"),
) as SeasonReviewData;

const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
}).format(new Date(`${value}T00:00:00Z`));

function GameCard({ game, badge, sub }: { game: GameRow; badge: string; sub?: string | null }) {
  const awayWon = game.awayScore > game.homeScore;
  return (
    <article className="article-card season-review-game">
      <div className="eyebrow">{dateLabel(game.date)}{game.venue ? ` · ${game.venue}` : ""}</div>
      <h3>
        <Link href={`/basketball/programs/${game.awayId}/`}>{game.away}</Link>{" "}
        <span className="brief-versus">at</span>{" "}
        <Link href={`/basketball/programs/${game.homeId}/`}>{game.home}</Link>
      </h3>
      <p className="season-review-score">
        <strong className={awayWon ? "winner" : ""}>{game.awayScore}</strong>
        <span>–</span>
        <strong className={!awayWon ? "winner" : ""}>{game.homeScore}</strong>
      </p>
      <p className="note">{badge}{sub ? ` · ${sub}` : ""}{game.note ? ` · ${game.note}` : ""}</p>
      <a className="hero-link" href={espnGameUrl(String(game.id))} target="_blank" rel="noreferrer">Open source game ↗</a>
    </article>
  );
}

export const metadata = {
  title: "2025–26 college basketball season in review",
  description: "Review the biggest men’s college basketball upsets, thrillers, champions and crowds from the 2025–26 source edition.",
  alternates: { canonical: "/basketball/season/" },
};

export default function Page() {
  const data = seasonData();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The rewind / {data.season}</div>
        <h1>Understand the season<br /><em>before the next one.</em></h1>
        <p>Use the final source edition to study the games that changed expectations: bracket-busting upsets, one-possession thrillers, league champions and the biggest crowds.</p>
        <p className="note">This is a descriptive retrospective from retained source rows. Scores and rankings stay attributed to the source edition; they do not change the 2026–27 forecast or recruiting evidence.</p>
      </div>
      <section className="section">
        <div className="section-heading"><div><div className="eyebrow">Bracket busters</div><h2>The biggest upsets.</h2></div><span className="note">Source SRS gap</span></div>
        <div className="article-grid">{data.upsets.slice(0, 10).map((game) => <GameCard key={game.id} game={game} badge={`+${game.srsGap ?? "—"} SRS gap`} />)}</div>
      </section>
      <section className="section">
        <div className="section-heading"><div><div className="eyebrow">Instant classics</div><h2>Games decided by a possession.</h2></div><span className="note">Final scores</span></div>
        <div className="article-grid">{data.thrillers.slice(0, 10).map((game) => <GameCard key={game.id} game={game} badge={`${Math.abs(game.homeScore - game.awayScore)}-point finish`} />)}</div>
      </section>
      <section className="section">
        <div className="section-heading"><div><div className="eyebrow">Banners</div><h2>Regular-season champions.</h2></div><span className="note">Publisher standings</span></div>
        <div className="article-grid">{data.champions.map((champion) => <article className="article-card" key={champion.conference}>
          <div className="eyebrow">{champion.conference}</div>
          <h3><Link href={`/basketball/programs/${champion.id}/`}>{champion.shortName}</Link></h3>
          <p>{champion.confRecord || "Conference record unavailable"} in league play · {champion.record || "Overall record unavailable"} overall.</p>
          <p className="note">Strength rank {champion.strengthRank || "—"}{champion.srsRank ? ` · SRS rank ${champion.srsRank}` : ""}</p>
          <Link className="hero-link" href={`/basketball/programs/${champion.id}/`}>Open program dossier →</Link>
        </article>)}</div>
      </section>
      <section className="section">
        <div className="section-heading"><div><div className="eyebrow">The scenes</div><h2>Where the crowds showed up.</h2></div><span className="note">Attendance when supplied</span></div>
        <div className="article-grid">{data.biggestCrowds.slice(0, 10).map((game) => <GameCard key={game.id} game={game} badge={`${(game.attendance ?? 0).toLocaleString()} fans`} sub={game.venue} />)}</div>
      </section>
      <p className="note">Source: retained SportsDataverse season-review release. Team links open the native scouting dossier; source-game links open the publisher page. Historical results are context, not current roster or eligibility evidence.</p>
    </>
  );
}
