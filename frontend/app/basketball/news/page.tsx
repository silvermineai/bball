import fs from "node:fs";
import path from "node:path";
import NewsArchive, { type PublisherArticle } from "./NewsArchive";

export const metadata = {
  title: "College basketball news archive",
  description: "Searchable men’s college basketball headlines with dates and retained summaries.",
  alternates: { canonical: "/basketball/news/" },
};

const publicArchiveText = (value: string) => value
  .replace(/<img\b[^>]*>/gi, "")
  .replace(/https?:\/\/[^\s"'<>]+/gi, "archived media");

export default function Page() {
  const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/news.json"), "utf8")) as {
    generated_at?: string;
    feeds?: Array<{ publisher: string; url: string; division?: string }>;
    attribution?: { feed_errors?: Array<{ fallback_articles?: number }> };
    articles?: PublisherArticle[];
  };
  const articles = (release.articles || [])
    .filter((article) => article.sport === "mens-college-basketball")
    .map(({ link: _link, publisher: _publisher, ...article }) => ({
      ...article,
      headline: publicArchiveText(article.headline),
      description: publicArchiveText(article.description),
    }));
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">News archive / reporting context</div>
        <h1>Read the news.<br /><em>Keep the clock.</em></h1>
        <p>Search retained men’s college basketball headlines that add context to the stats desk. Publication times stay attached so reporting remains distinct from Silvermine’s statistics, forecasts and recruiting evidence.</p>
        <div className="hero-actions"><a className="button" href="/basketball/pressroom/">Open the press room ↗</a><a className="hero-link" href="/basketball/recruiting/">Open recruiting evidence →</a></div>
      </div>
      <NewsArchive generatedAt={release.generated_at} articles={articles} groupCount={release.feeds?.length || 0} feedErrorCount={release.attribution?.feed_errors?.length || 0} />
    </>
  );
}
