import Link from "next/link";
export const metadata = { title: "College basketball intelligence" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="sport-nav" aria-label="Basketball navigation">
        <Link href="/basketball/">Basketball desk</Link>
        <Link href="/basketball/matchups/">2026–27 matchups</Link>
        <Link href="/basketball/ratings/">Efficiency ratings</Link>
        <Link href="/basketball/players/">Player stats</Link>
        <Link href="/basketball/impact/">Player impact</Link>
        <Link href="/basketball/recruiting/">Roster changes</Link>
        <Link href="/basketball/model/">Model notebook</Link>
        <Link href="/research/scorecard/?sport=basketball">
          Forecast record
        </Link>
        <a href="/basketball/scout/">Scouting archive ↗</a>
      </nav>
      {children}
    </>
  );
}
