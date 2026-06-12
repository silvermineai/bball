import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SectionTitle, TeamMark } from "@/components/Annual";

export const Route = createFileRoute("/leaders")({
  component: LeadersPage,
});

type LeaderRow = {
  athleteId: number;
  name: string;
  position: string | null;
  classYear: string | null;
  value: number;
  teamId: number;
  team: string;
  teamLogo: string | null;
  conference: string | null;
};

type LeadersData = {
  season: string;
  categories: Record<string, { label: string; rows: LeaderRow[] }>;
};

const CAT_ORDER = ["pointsPerGame", "reboundsPerGame", "assistsPerGame", "PER", "3PointMadePerGame", "stealsPerGame", "blocksPerGame"];

function LeadersPage() {
  const { data } = useQuery({
    queryKey: ["insights", "leaders"],
    queryFn: async () => {
      const res = await fetch("/data/leaders.json");
      if (!res.ok) throw new Error("Could not load leaders");
      return (await res.json()) as LeadersData;
    },
    staleTime: Infinity,
  });
  const [active, setActive] = useState("pointsPerGame");

  if (!data) return <div className="py-20 text-center font-stat text-sm text-graphite">Tallying the leaders…</div>;
  const cats = CAT_ORDER.filter((c) => data.categories[c]);
  const current = data.categories[active];
  const podium = current.rows.slice(0, 3);
  const rest = current.rows.slice(3);

  return (
    <div className="space-y-8">
      <div className="rise rise-1">
        <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">The names to know</div>
        <h1 className="font-display text-4xl font-semibold">National Leaders · {data.season}</h1>
        <p className="mt-2 max-w-2xl text-sm text-graphite">
          The country's best, category by category — from team statistical leaders across all 362 programs. Recruiting context and
          press-box ammunition in one place.
        </p>
      </div>

      <div className="rise rise-2 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActive(c)}
            className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
              active === c ? "bg-ink text-white" : "border border-line bg-white text-graphite hover:border-court"
            }`}
          >
            {data.categories[c].label}
          </button>
        ))}
      </div>

      {/* podium */}
      <section className="rise rise-3 grid gap-4 sm:grid-cols-3">
        {podium.map((r, i) => (
          <div key={r.athleteId} className={`relative overflow-hidden rounded-lg border border-line bg-white p-5 shadow-panel ${i === 0 ? "sm:-translate-y-2" : ""}`}>
            <span className="ghost-numeral absolute -right-2 -top-4 text-7xl">{i + 1}</span>
            <div className="font-display text-xl font-semibold">{r.name}</div>
            <div className="font-stat text-[11px] text-graphite">
              {[r.position, r.classYear].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-3 font-display text-5xl font-black text-court">{r.value}</div>
            <Link
              to="/scout/$teamId"
              params={{ teamId: String(r.teamId) }}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium hover:text-court"
            >
              <TeamMark team={{ shortName: r.team, logo: r.teamLogo }} size={20} withName={false} />
              {r.team}
            </Link>
          </div>
        ))}
      </section>

      <section className="rise rise-4">
        <SectionTitle kicker={current.label} title="The top 25" />
        <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white shadow-panel">
          <table className="w-full text-[12.5px]">
            <tbody>
              {rest.map((r, i) => (
                <tr key={r.athleteId} className="rule-thin">
                  <td className="w-10 px-3 py-2 text-center font-stat text-[11px] font-semibold text-graphite">{i + 4}</td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 font-stat text-[11px] text-graphite">
                    {[r.position, r.classYear].filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-3 py-2">
                    <Link to="/scout/$teamId" params={{ teamId: String(r.teamId) }} className="inline-flex items-center gap-1.5 hover:text-court">
                      <TeamMark team={{ shortName: r.team, logo: r.teamLogo }} size={16} withName={false} />
                      {r.team}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-graphite lg:table-cell">{r.conference}</td>
                  <td className="px-3 py-2 text-right font-stat font-semibold">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
