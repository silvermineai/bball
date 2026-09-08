import Link from "next/link";
export const metadata = { title: "College basketball intelligence" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="sport-nav" aria-label="Basketball navigation">
        <Link href="/basketball/">Basketball desk</Link>
        <Link href="/basketball/learn/">Learn the game</Link>
        <Link href="/basketball/matchups/">2026–27 matchups</Link>
        <Link href="/basketball/pressroom/">Press room</Link>
        <Link href="/basketball/gameplan/">Game plan</Link>
        <Link href="/basketball/ratings/">Efficiency ratings</Link>
        <Link href="/basketball/boutique/">Boutique models</Link>
        <Link href="/basketball/lineups/">Lineup lab</Link>
        <Link href="/basketball/matchup-stints/">Five-v-five matchups</Link>
        <Link href="/basketball/conferences/">Conferences</Link>
        <Link href="/basketball/programs/">Program dossiers</Link>
        <Link href="/basketball/compare/">Compare programs</Link>
        <Link href="/basketball/players/">Player stats</Link>
        <Link href="/basketball/player-profiles/">Player profiles</Link>
        <Link href="/basketball/source-stats/">Source stat browser</Link>
        <Link href="/basketball/ncaa-player-box/">NCAA player box archive</Link>
        <Link href="/basketball/ncaa-rankings/">NCAA player rankings</Link>
        <Link href="/basketball/ncaa-careers/">NCAA historical leaderboard</Link>
        <Link href="/basketball/ncaa-rosters/">NCAA roster intel</Link>
        <Link href="/basketball/ncaa-high-schools/">High-school pipeline</Link>
        <Link href="/basketball/ncaa-shooting/">NCAA shooting profiles</Link>
        <Link href="/basketball/team-stats/">Team stat browser</Link>
        <Link href="/basketball/ncaa-team-box/">NCAA team box archive</Link>
        <Link href="/basketball/leaders/">National leaders</Link>
        <Link href="/basketball/ncaa/">NCAA leaderboards</Link>
        <Link href="/basketball/scouting-board/">Build a player board</Link>
        <Link href="/basketball/film/">Film room</Link>
        <Link href="/basketball/compare-players/">Compare players</Link>
        <Link href="/basketball/shooting/">Shooting lab</Link>
        <Link href="/basketball/pbp/">Play-by-play archive</Link>
        <Link href="/basketball/impact/">Player impact</Link>
        <Link href="/basketball/impact/within-team/">Within-team RAPM</Link>
        <Link href="/basketball/recruiting/">Recruiting</Link>
        <Link href="/basketball/roster-lab/">Roster impact lab</Link>
        <Link href="/basketball/model/">Model notebook</Link>
        <Link href="/basketball/evaluation/">Model experiments</Link>
        <Link href="/research/scorecard/?sport=basketball">
          Forecast record
        </Link>
        <a href="/basketball/scout/">Scouting archive ↗</a>
      </nav>
      {children}
    </>
  );
}
