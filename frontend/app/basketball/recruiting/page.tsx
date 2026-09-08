import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Announcements from "./Announcements";
import { getRecruiting, getRosters } from "../../_lib/basketball-data";
import RecruitingWire from "./RecruitingWire";
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
  const recruitingNews = news.articles.filter((article) =>
      article.categories.some((category) => /NCAA Men's Basketball/i.test(category)) &&
      /recruit|transfer|portal|commit|sign|class of|prospect/i.test(
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
      <Announcements data={data} rosters={rosters} />
    </>
  );
}
