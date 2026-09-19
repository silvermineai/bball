import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import GlobalSearch from "./_components/GlobalSearch";
export const metadata: Metadata = {
  metadataBase: new URL("https://bball.silvermine.dev"),
  title: {
    default: "Silvermine · College basketball stats",
    template: "%s · Silvermine",
  },
  description:
    "College basketball team stats, player production, upcoming games and Silvermine model predictions.",
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="masthead">
          <div className="header-inner">
            <Link className="brand" href="/">
              <span className="brand-monogram">
                S<span>↗</span>
              </span>
              <span>
                <small>SILVERMINE</small>
                <strong>College basketball stats</strong>
              </span>
            </Link>
            <div className="edition">
              LIVE BOARD
              <br />
              2026–27 SEASON
            </div>
            <GlobalSearch />
          </div>
          <nav className="main-nav" aria-label="Main navigation">
            <div className="main-nav-primary">
              <Link className="main-nav-home" href="/">Home</Link>
              <Link href="/basketball/ratings/">Teams</Link>
              <Link href="/basketball/players/">Players</Link>
              <Link href="/basketball/recruiting/">Recruiting</Link>
              <Link href="/basketball/matchups/">Games</Link>
              <Link href="/basketball/forecast-lab/">Predictions</Link>
              <Link href="/football/">Football</Link>
              <Link href="/blog/">Journal</Link>
            </div>
            <details className="main-nav-explore">
              <summary>Explore</summary>
              <div className="main-nav-panel">
                <div className="main-nav-group">
                  <div className="eyebrow">Football desk</div>
                  <Link href="/football/matchups/">Matchups</Link>
                  <Link href="/football/players/">Player index</Link>
                  <Link href="/football/ncaa-leaders/">National leaders</Link>
                  <Link href="/football/source-stats/">Stat archive</Link>
                  <Link href="/football/recruiting/">Recruiting &amp; rosters</Link>
                  <Link href="/football/careers/">Player careers</Link>
                  <Link href="/football/events/">Defense &amp; specialists</Link>
                  <Link href="/football/efficiency/">Team efficiency</Link>
                  <Link href="/football/ratings/">Power ratings</Link>
                  <Link href="/football/learn/">Football guide</Link>
                  <Link href="/football/methodology/">Methodology</Link>
                </div>
                <div className="main-nav-group">
                  <div className="eyebrow">Basketball desk</div>
                  <Link href="/basketball/coach/">Team tools</Link>
                  <Link href="/basketball/matchups/">Matchups</Link>
                  <Link href="/basketball/forecast-lab/">Forecast lab</Link>
                  <Link href="/basketball/players/">Player stats</Link>
                  <Link href="/basketball/lineups/">Lineups</Link>
                  <Link href="/basketball/ncaa-rankings/">Efficiency metrics</Link>
                  <Link href="/basketball/recruiting/">Recruiting board</Link>
                  <Link href="/basketball/learn/">Basketball guide</Link>
                </div>
                <div className="main-nav-group">
                  <div className="eyebrow">More data</div>
                  <Link href="/blog/">The journal</Link>
                  <Link href="/research/coverage/">Data coverage</Link>
                  <Link href="/research/scorecard/">Forecast record</Link>
                  <Link href="/research/markets/">Market archive</Link>
                  <Link href="/feed.xml">Subscribe to RSS ↗</Link>
                </div>
              </div>
            </details>
          </nav>
        </header>
        <main id="main" className="page-wrap">
          {children}
        </main>
        <footer className="site-footer">
          <div>
            <strong>Silvermine</strong>
            <p>College basketball stats and model forecasts.</p>
          </div>
          <p>
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
