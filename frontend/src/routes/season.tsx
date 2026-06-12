import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Trophy, Users, Zap } from "lucide-react";
import { SectionTitle, TeamMark } from "@/components/Annual";
import { insights } from "@/lib/insights";

export const Route = createFileRoute("/season")({
  component: SeasonReview,
});

type GameRow = {
  id: number;
  date: string;
  home: string;
  homeId: number;
  homeLogo: string | null;
  homeScore: number;
  away: string;
  awayId: number;
  awayLogo: string | null;
  awayScore: number;
  venue: string | null;
  note: string | null;
  attendance: number | null;
  homeRank: number | null;
  awayRank: number | null;
  srsGap?: number;
};

type SeasonReviewData = {
  season: string;
  upsets: GameRow[];
  thrillers: GameRow[];
  champions: {
    conference: string;
    strengthRank: number;
    id: number;
    name: string;
    shortName: string;
    logo: string | null;
    confRecord: string | null;
    record: string | null;
    srsRank: number | null;
  }[];
  biggestCrowds: GameRow[];
};

function SeasonReview() {
  const { data } = useQuery({
    queryKey: ["insights", "season"],
    queryFn: async () => {
      const res = await fetch("/data/season_review.json");
      if (!res.ok) throw new Error("Could not load season review");
      return (await res.json()) as SeasonReviewData;
    },
    staleTime: Infinity,
  });

  if (!data) return <div className="py-20 text-center font-stat text-sm text-graphite">Rewinding the season…</div>;

  return (
    <div className="space-y-10">
      <div className="rise rise-1">
        <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">The Rewind</div>
        <h1 className="font-display text-4xl font-semibold">Season in Review · {data.season}</h1>
        <p className="mt-2 max-w-2xl text-sm text-graphite">
          The games that defined the year — bracket-busting upsets, one-possession classics between top-25 teams, and the league
          champions. Reporter gold, all from the final data.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="rise rise-2">
          <SectionTitle kicker="Bracket busters" title="Biggest upsets" right={<Zap size={18} className="text-brass" />} />
          <div className="mt-3 space-y-2">
            {data.upsets.slice(0, 10).map((g) => (
              <GameCard key={g.id} g={g} badge={`+${g.srsGap} SRS gap`} />
            ))}
          </div>
        </section>

        <section className="rise rise-3">
          <SectionTitle kicker="Instant classics" title="Top-25 thrillers" right={<Flame size={18} className="text-miss" />} />
          <div className="mt-3 space-y-2">
            {data.thrillers.slice(0, 10).map((g) => (
              <GameCard key={g.id} g={g} badge={Math.abs(g.homeScore - g.awayScore) === 1 ? "1-pt game" : "2-pt game"} />
            ))}
          </div>
        </section>
      </div>

      <section className="rise rise-4">
        <SectionTitle kicker="Banners" title="Regular-season champions, league by league" right={<Trophy size={18} className="text-brass" />} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.champions.map((c) => (
            <Link
              key={c.conference}
              to="/scout/$teamId"
              params={{ teamId: String(c.id) }}
              className="group rounded-lg border border-line bg-white p-4 shadow-panel transition hover:-translate-y-0.5"
            >
              <div className="font-stat text-[10px] uppercase tracking-wider text-graphite">{c.conference}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <TeamMark team={c} size={26} withName={false} />
                <span className="font-display text-base font-semibold group-hover:text-court">{c.shortName}</span>
              </div>
              <div className="mt-1 font-stat text-[11px] text-graphite">
                {c.confRecord} league · {c.record} overall
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rise rise-5">
        <SectionTitle kicker="The scenes" title="Biggest crowds of the year" right={<Users size={18} className="text-court" />} />
        <div className="mt-3 space-y-2">
          {data.biggestCrowds.slice(0, 6).map((g) => (
            <GameCard key={g.id} g={g} badge={`${(g.attendance ?? 0).toLocaleString()} fans`} sub={g.venue ?? undefined} />
          ))}
        </div>
      </section>
    </div>
  );
}

function GameCard({ g, badge, sub }: { g: GameRow; badge?: string; sub?: string }) {
  const awayWon = g.awayScore > g.homeScore;
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-white px-4 py-2.5 shadow-panel">
      <span className="font-stat text-[11px] text-graphite">{g.date.slice(5)}</span>
      <span className="flex items-center gap-1.5 text-[13px]">
        {g.awayLogo ? <img src={g.awayLogo} alt="" width={18} height={18} loading="lazy" /> : null}
        <Link to="/scout/$teamId" params={{ teamId: String(g.awayId) }} className={`hover:text-court ${awayWon ? "font-bold" : ""}`}>
          {g.away}
        </Link>
        <b className="font-stat">{g.awayScore}</b>
        <span className="text-graphite">@</span>
        {g.homeLogo ? <img src={g.homeLogo} alt="" width={18} height={18} loading="lazy" /> : null}
        <Link to="/scout/$teamId" params={{ teamId: String(g.homeId) }} className={`hover:text-court ${!awayWon ? "font-bold" : ""}`}>
          {g.home}
        </Link>
        <b className="font-stat">{g.homeScore}</b>
      </span>
      {g.note ? <span className="hidden font-stat text-[10px] text-brass md:inline">{g.note}</span> : null}
      {sub ? <span className="hidden font-stat text-[10px] text-graphite md:inline">{sub}</span> : null}
      {badge ? <span className="ml-auto rounded bg-paper px-2 py-0.5 font-stat text-[10px] font-semibold text-graphite">{badge}</span> : null}
    </div>
  );
}
