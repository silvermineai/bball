import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, Film, Newspaper, Target, TrendingUp, UsersRound } from "lucide-react";
import { SectionTitle, TeamMark } from "@/components/Annual";
import { insights } from "@/lib/insights";

export const Route = createFileRoute("/")({
  component: CommandCenter,
});

const TOOLS = [
  {
    to: "/scout",
    icon: ClipboardList,
    title: "Scouting Reports",
    blurb: "A full dossier on all 362 teams — tendencies, personnel, and how to beat them.",
  },
  {
    to: "/gameplan",
    icon: Target,
    title: "Game Plan",
    blurb: "Pick two teams. Get the tale of the tape, a projection, and keys to the game.",
  },
  {
    to: "/recruiting",
    icon: UsersRound,
    title: "Recruiting Board",
    blurb: "Roster runway, departing production, and positional needs for every program.",
  },
  {
    to: "/pressroom",
    icon: Newspaper,
    title: "Press Room",
    blurb: "Storylines, stat nuggets, and article starters for beat writers on deadline.",
  },
  {
    to: "/film",
    icon: Film,
    title: "Film Room",
    blurb: "Official game film and highlights, matched to teams automatically.",
  },
  {
    to: "/rankings",
    icon: TrendingUp,
    title: "Power Ratings",
    blurb: "Schedule-adjusted ratings for the full field, beyond the polls.",
  },
] as const;

function CommandCenter() {
  const { data: teamsData } = useQuery({ queryKey: ["insights", "teams"], queryFn: insights.teams, staleTime: Infinity });
  const { data: meta } = useQuery({ queryKey: ["insights", "meta"], queryFn: insights.meta, staleTime: Infinity });
  const { data: newsData } = useQuery({ queryKey: ["insights", "news"], queryFn: insights.news, staleTime: Infinity });

  const teams = teamsData?.teams ?? [];
  const top10 = teams.filter((t) => t.srsRank != null).slice(0, 10);
  const apTop = teams
    .filter((t) => t.apRank != null)
    .sort((a, b) => (a.apRank ?? 99) - (b.apRank ?? 99))
    .slice(0, 25);
  const champion = apTop[0];
  const articles = (newsData?.articles ?? []).slice(0, 6);

  return (
    <div className="space-y-10">
      {/* masthead */}
      <section className="rise rise-1 relative overflow-hidden rounded-lg bg-ink px-6 py-10 text-paper sm:px-10 grain">
        <div className="pointer-events-none absolute -right-8 -top-10 select-none font-display text-[11rem] font-black leading-none text-white/5">
          {meta?.season ?? "2025-26"}
        </div>
        <div className="relative">
          <div className="font-stat text-[11px] uppercase tracking-[0.3em] text-brass">The Coaching Annual · Men's College Basketball</div>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
            Every team. Every tendency. <span className="italic text-brass">One binder.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/70">
            {meta ? (
              <>
                Built from <span className="font-stat text-paper">{meta.completedGames.toLocaleString()}</span> real games across{" "}
                <span className="font-stat text-paper">{meta.teamsTracked}</span> Division I teams — scores, rosters, season statistics,
                rankings, and film from public sources.
              </>
            ) : (
              "Scores, rosters, season statistics, rankings, and film — all from public sources."
            )}
          </p>
          {champion ? (
            <Link
              to="/scout/$teamId"
              params={{ teamId: String(champion.id) }}
              className="mt-6 inline-flex items-center gap-3 rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-sm transition hover:bg-white/10"
            >
              <TeamMark team={champion} size={26} withName={false} />
              <span>
                <span className="text-paper/60">Final AP No. 1:</span> <span className="font-semibold">{champion.name}</span>{" "}
                <span className="font-stat text-paper/60">{champion.record}</span>
              </span>
              <ArrowRight size={15} className="text-brass" />
            </Link>
          ) : null}
        </div>
      </section>

      {/* tools */}
      <section className="rise rise-2">
        <SectionTitle kicker="The Toolkit" title="Built for the week of prep" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className="group relative overflow-hidden rounded-lg border border-line bg-white p-5 shadow-panel transition hover:-translate-y-0.5"
            >
              <tool.icon size={20} className="text-court" />
              <div className="mt-3 font-display text-lg font-semibold">{tool.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-graphite">{tool.blurb}</p>
              <ArrowRight size={15} className="mt-3 text-brass transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-graphite">
          <span className="font-stat text-[10px] uppercase tracking-[0.2em] text-court">Also in the annual</span>
          <Link to="/season" className="font-medium hover:text-court">Season in Review →</Link>
          <Link to="/leaders" className="font-medium hover:text-court">National Leaders →</Link>
          <Link to="/conferences" className="font-medium hover:text-court">Conference Standings →</Link>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        {/* power board */}
        <section className="rise rise-3">
          <SectionTitle
            kicker="Power Ratings"
            title="The top of the field"
            right={
              <Link to="/rankings" className="font-stat text-[12px] uppercase tracking-wider text-court hover:text-ink">
                Full board →
              </Link>
            }
          />
          <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white shadow-panel">
            {top10.map((t, i) => (
              <Link
                key={t.id}
                to="/scout/$teamId"
                params={{ teamId: String(t.id) }}
                className={`flex items-center gap-4 px-4 py-3 transition hover:bg-paper ${i > 0 ? "rule-thin" : ""}`}
              >
                <span className="ghost-numeral w-10 text-3xl">{i + 1}</span>
                <TeamMark team={t} size={30} bold />
                <span className="hidden font-stat text-[12px] text-graphite sm:inline">{t.conference}</span>
                <span className="ml-auto font-stat text-[13px] tabular-nums text-graphite">{t.record}</span>
                <span className="w-14 text-right font-stat text-sm font-semibold tabular-nums">
                  {t.srs != null && t.srs > 0 ? "+" : ""}
                  {t.srs}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* news + AP strip */}
        <section className="rise rise-4 space-y-8">
          <div>
            <SectionTitle kicker="The Wire" title="Latest from the beat" />
            <div className="mt-3 space-y-3">
              {articles.map((a) => (
                <a
                  key={a.id}
                  href={a.link ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-line bg-white p-4 shadow-panel transition hover:-translate-y-0.5"
                >
                  <div className="text-sm font-semibold leading-snug">{a.headline}</div>
                  <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-graphite">{a.description}</div>
                  <div className="mt-2 font-stat text-[10px] uppercase tracking-wider text-court">
                    ESPN · {a.published ? new Date(a.published).toLocaleDateString() : ""}
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle kicker="Final AP Poll" title="The Top 25" />
            <div className="mt-3 grid grid-cols-1 gap-x-6 rounded-lg border border-line bg-white p-4 shadow-panel sm:grid-cols-2">
              {apTop.map((t) => (
                <Link
                  key={t.id}
                  to="/scout/$teamId"
                  params={{ teamId: String(t.id) }}
                  className="flex items-center gap-2 py-1 text-[13px] hover:text-court"
                >
                  <span className="w-6 font-stat text-[11px] font-semibold text-graphite">{t.apRank}</span>
                  <TeamMark team={t} size={18} />
                  <span className="ml-auto font-stat text-[11px] text-graphite">{t.record}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
