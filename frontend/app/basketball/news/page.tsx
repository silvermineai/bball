import fs from "node:fs";
import path from "node:path";
import NewsArchive, { type PublisherArticle } from "./NewsArchive";

export const metadata = {
  title: "College basketball publisher news archive",
  description: "Searchable ESPN and NCAA.com men’s college basketball publisher headlines with source links, dates and attribution.",
  alternates: { canonical: "/basketball/news/" },
};

export default function Page() {
  const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/news.json"), "utf8")) as {
    generated_at?: string;
    feeds?: Array<{ publisher: string; url: string }>;
    attribution?: { terms?: string };
    articles?: PublisherArticle[];
  };
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Source desk / publisher reporting</div>
        <h1>Read the news.<br /><em>Keep the clock.</em></h1>
        <p>Search the retained men’s college basketball headlines that inform the coaching desk. Every row keeps its publisher, publication time and source URL attached so reporting context stays distinct from Silvermine’s statistics, forecasts and recruiting evidence.</p>
        <div className="hero-actions"><a className="button" href="/basketball/pressroom/">Open the press room ↗</a><a className="hero-link" href="/basketball/recruiting/">Open recruiting evidence →</a></div>
      </div>
      <NewsArchive generatedAt={release.generated_at} articles={(release.articles || []).filter((article) => article.sport === "mens-college-basketball")} feeds={release.feeds || []} termsUrl={release.attribution?.terms} />
    </>
  );
}
