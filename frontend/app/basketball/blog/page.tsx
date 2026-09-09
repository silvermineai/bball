import Link from "next/link";

export const metadata = {
  title: "Basketball journal",
  description:
    "Game analysis, model explainers and recruiting research from The Coaching Annual.",
  alternates: { canonical: "/blog/" },
};

export default function Page() {
  return (
    <section className="page-title">
      <div className="eyebrow">Basketball journal</div>
      <h1>Read the game beyond the box score.</h1>
      <p>
        Game analysis, model explainers and recruiting research live in The
        Coaching Annual journal.
      </p>
      <div className="hero-actions">
        <Link className="button" href="/blog/">
          Open the journal ↗
        </Link>
        <Link className="hero-link" href="/basketball/matchups/">
          Read a matchup first →
        </Link>
      </div>
    </section>
  );
}
