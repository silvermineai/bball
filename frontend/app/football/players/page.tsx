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
      <PlayerBrowser />
    </>
  );
}
