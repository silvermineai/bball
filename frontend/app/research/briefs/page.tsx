import Archive from "./Archive";
export const metadata = {
  title: "Matchup reading archive | Basketball and football",
  description:
    "Frozen matchup briefs, capture dates and retained supporting evidence for college basketball and football.",
};
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The research library / Retained analysis</div>
        <h1>
          The record stays
          <br />
          after the game.
        </h1>
        <p>
          Browse frozen reading snapshots of our matchup briefs. Each version
          keeps its forecast, source context and data downloads, even when a
          later schedule refresh changes the live site.
        </p>
      </div>
      <Archive />
    </>
  );
}
