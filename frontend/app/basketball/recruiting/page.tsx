import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Announcements from "./Announcements";
import { getRecruiting } from "../../_lib/basketball-data";
import RecruitingWire from "./RecruitingWire";
export const metadata = {
  title: "Basketball recruiting: school announcements and transfer evidence",
  description:
    "Dated 2026–27 school announcements, prior college stats, availability updates and all-program coverage labels. Source-linked recruiting research with explicit coverage limits.",
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
          Roster construction / 2026–27 research file
        </div>
        <h1>
          Follow the player.
          <br />
          Keep the evidence.
        </h1>
        <p>
          Who a school announced. Where they played. What the next statement
          changed. Build your recruiting picture from dated sources and recorded
          college production.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/basketball/ncaa-rosters/">Search NCAA roster intel ↗</Link>
          <Link className="button secondary" href="/basketball/roster-lab/">Compare roster workload ↗</Link>
          <Link className="button secondary" href="/basketball/roster-board/">Rank roster workload ↗</Link>
          <Link className="hero-link" href="/basketball/ncaa-rankings/">Rank recorded production →</Link>
        </div>
      </div>
      <RecruitingWire articles={recruitingNews} />
      <section className="section recruiting-context">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Eligibility / official context</div>
            <h2>Keep the transfer clock at the source.</h2>
          </div>
          <p>
            Portal language, eligibility and a school roster observation are
            different evidence. Start with the NCAA rule and research pages,
            then return to the dated source records below.
          </p>
        </div>
        <div className="two-col">
          <article className="paper-panel">
            <div className="eyebrow">Rules and eligibility</div>
            <h3>NCAA transfer rules and eligibility</h3>
            <p>
              The NCAA describes its Transfer Portal as a centralized database
              for student-athlete transfer information. The official rules page
              is the reference point for eligibility questions; Silvermine does
              not infer a ruling from an announcement or roster row.
            </p>
            <a
              className="text-link"
              href="https://www.ncaa.org/eligibility-center/transfer-rules-and-eligibility/"
              target="_blank"
              rel="noreferrer"
            >
              Open NCAA transfer rules ↗
            </a>
          </article>
          <article className="paper-panel">
            <div className="eyebrow">Aggregate research</div>
            <h3>NCAA transfer research</h3>
            <p>
              NCAA research dashboards provide aggregate portal and transfer
              composition context. They are useful for the national picture,
              but they are not player-level transaction records for this board.
            </p>
            <a
              className="text-link"
              href="https://www.ncaa.org/what-we-do/research/student-athlete-transfer-research/"
              target="_blank"
              rel="noreferrer"
            >
              Open NCAA transfer research ↗
            </a>
            <p className="note" style={{ marginTop: 16 }}>
              Direct dashboards: {" "}
              <a className="text-link" href="https://public.tableau.com/views/RES_Transfer_Dash_Final/Transfer_Dash_1" target="_blank" rel="noreferrer">DI composition ↗</a>{" · "}
              <a className="text-link" href="https://public.tableau.com/views/DI_Transfer_Portal_2024/2026DIupdate" target="_blank" rel="noreferrer">DI portal ↗</a>{" · "}
              <a className="text-link" href="https://public.tableau.com/views/DII_Transfer_Portal_2024/2026DIIupdate" target="_blank" rel="noreferrer">DII portal ↗</a>
            </p>
          </article>
        </div>
        <p className="section-note">
          This edition keeps player-level recruiting evidence to source-linked
          school announcements and attributed roster observations. A missing
          announcement or portal record does not imply no transfer activity.
        </p>
      </section>
      <Announcements data={data} />
    </>
  );
}
