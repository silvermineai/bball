import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://bball.silvermine.dev"),
  title: {
    default: "The Coaching Annual · College sports, understood",
    template: "%s · The Coaching Annual",
  },
  description:
    "College football forecasts, player production and transparent model research. Basketball scouting and recruiting tools from Silvermine.",
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
                <small>SILVERMINE RESEARCH</small>
                <strong>The Coaching Annual</strong>
              </span>
            </Link>
            <div className="edition">
              VOLUME 01
              <br />
              2026–27 SEASON
            </div>
          </div>
          <nav className="main-nav" aria-label="Main navigation">
            <Link href="/football/">Football desk</Link>
            <Link href="/football/matchups/">Matchups</Link>
            <Link href="/football/players/">Player index</Link>
            <Link href="/football/events/">Defense & specialists</Link>
            <Link href="/football/efficiency/">Team efficiency</Link>
            <Link href="/football/ratings/">Power ratings</Link>
            <Link href="/blog/">The journal</Link>
            <Link href="/research/scorecard/">Forecast record</Link>
            <a href="/basketball/">Basketball ↗</a>
            <Link href="/football/methodology/">Methodology</Link>
          </nav>
        </header>
        <main id="main" className="page-wrap">
          {children}
        </main>
        <footer className="site-footer">
          <div>
            <strong>The Coaching Annual</strong>
            <p>Know the numbers. Ask better questions.</p>
          </div>
          <p>
            Data:{" "}
            <a href="https://github.com/sportsdataverse/sportsdataverse-data">
              SportsDataverse
            </a>{" "}
            ·{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
            <br />
            Normalized statistics and independent Silvermine estimates.
            <br />
            <Link href="/research/coverage/">
              Sources, coverage & limitations →
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
