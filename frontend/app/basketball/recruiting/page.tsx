import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Announcements from "./Announcements";
import { getRecruiting } from "../../_lib/basketball-data";
import RecruitingWire from "./RecruitingWire";
import AuthorizedIntake from "./AuthorizedIntake";
import MovementWatch from "./MovementWatch";
import RecruitingBoard from "./EspnRecruitingBoard";
import LiveBasketballRecruitingStatus from "../../_components/LiveBasketballRecruitingStatus";
import LiveBasketballProspectStatus from "../../_components/LiveBasketballProspectStatus";
export const metadata = {
  title: "Basketball recruiting: rankings, movement and player production",
  description:
    "Search prospect rankings alongside player production, roster movement, dated additions and coverage labels.",
  alternates: { canonical: "/basketball/recruiting/" },
};
export default function Page() {
  const data = getRecruiting();
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
      sport?: string;
    }[];
  };
  const recruitingNews = news.articles.filter((article) =>
      (article.sport === "mens-college-basketball" || article.categories.some((category) => /NCAA Men's Basketball/i.test(category))) &&
      /recruit|transfer|portal|commit|sign|class of|prospect|injur|surgery|\bout\b|miss(?:es|ing)?(?:\s+the)?\s+season|unavailable|return to play/i.test(
        `${article.headline} ${article.description} ${article.categories.join(" ")}`,
      ),
    );
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
      <RecruitingWire articles={recruitingNews} />
      <MovementWatch />
      <RecruitingBoard />
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
