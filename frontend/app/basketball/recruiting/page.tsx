import fs from "node:fs";
import path from "node:path";
import Announcements from "./Announcements";
import { getRecruiting, getRosters } from "../../_lib/basketball-data";
import { date } from "../../_lib/format";
export const metadata = {
  title: "Basketball recruiting: school announcements and transfer evidence",
  description:
    "Dated 2026–27 school announcements, prior college stats, availability updates and all-program coverage labels. Source-linked recruiting research with explicit coverage limits.",
  alternates: { canonical: "/basketball/recruiting/" },
};
export default function Page() {
  const data = getRecruiting();
  const rosters = getRosters();
  const news = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/news.json"), "utf8"),
  ) as {
    articles: {
      id: string;
      headline: string;
      description: string;
      published: string;
      link: string;
      categories: string[];
    }[];
  };
  const recruitingNews = news.articles
    .filter((article) =>
      article.categories.some((category) => /NCAA Men's Basketball/i.test(category)) &&
      /recruit|transfer|portal|commit|sign|class of|prospect/i.test(
        `${article.headline} ${article.description} ${article.categories.join(" ")}`,
      ),
    )
    .slice(0, 12);
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
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Publisher wire / Recruiting context</div>
            <h2>What the national conversation is tracking.</h2>
          </div>
          <span className="note">{recruitingNews.length} linked stories</span>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>
          These are publisher articles for context, not Silvermine-reviewed
          transaction records. A headline does not establish a player’s
          eligibility, destination or current availability; reviewed school
          statements appear below.
        </p>
        <div className="article-grid">
          {recruitingNews.map((article) => (
            <article className="article-card" key={article.id}>
              <div className="eyebrow">{date(article.published)} · ESPN</div>
              <h2>{article.headline}</h2>
              <p>{article.description}</p>
              <a href={article.link} target="_blank" rel="noreferrer">
                Read publisher article ↗
              </a>
            </article>
          ))}
        </div>
      </section>
      <Announcements data={data} rosters={rosters} />
    </>
  );
}
