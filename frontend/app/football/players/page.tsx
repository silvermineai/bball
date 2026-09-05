import Link from "next/link";
import PlayerBrowser from "./PlayerBrowser";
export const metadata = {
  title: "College football player statistics and rankings",
};
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Player evaluation / Production in context</div>
        <h1>Find the difference-makers.</h1>
        <p>
          Search all players represented in the imported box scores. Compare
          offensive production within a category using total expected points
          added (EPA). These are production rankings, not recruiting grades or
          predictions of transfer availability.
        </p>
      </div>
      <p className="note" style={{ marginBottom: 24 }}>
        Looking for sacks, turnovers, punting or return records? The{" "}
        <Link href="/football/events/">defense and specialist notebook →</Link>{" "}
        exposes additional name-attributed game records that cannot be joined to
        these profiles by athlete ID.
      </p>
      <PlayerBrowser />
    </>
  );
}
