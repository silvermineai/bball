import Players from "./Players";
export const metadata = { title: "College basketball player statistics" };
export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">2025–26 player production</div>
        <h1>Follow the production.</h1>
        <p>
          Search players with recorded minutes in the imported box scores.
          Compare per-game production, shooting efficiency and workload, then
          open the complete game log. Team labels describe the stat season, not
          current recruiting availability.
        </p>
      </div>
      <Players />
    </>
  );
}
