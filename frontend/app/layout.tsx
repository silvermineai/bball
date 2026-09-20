import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import GlobalSearch from "./_components/GlobalSearch";
import SportNavigation from "./_components/SportNavigation";
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
                <strong>College sports stats</strong>
              </span>
            </Link>
            <div className="edition">
              LIVE BOARD
              <br />
              2026–27 SEASON
            </div>
            <GlobalSearch />
          </div>
          <SportNavigation />
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
