import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SectionTitle, TeamMark } from "@/components/Annual";
import { insights } from "@/lib/insights";
import type { Conference } from "@/lib/insights";

export const Route = createFileRoute("/conferences")({
  component: ConferencesPage,
});

function ConferencesPage() {
  const { data } = useQuery({ queryKey: ["insights", "conferences"], queryFn: insights.conferences, staleTime: Infinity });
  const conferences = data?.conferences ?? [];
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="rise rise-1">
        <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">League by league</div>
        <h1 className="font-display text-4xl font-semibold">Conferences</h1>
        <p className="mt-2 max-w-2xl text-sm text-graphite">
          All 32 leagues ranked by average power rating, with final {data?.season} standings. Open a league for the full table.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {conferences.map((c, i) => (
          <ConferenceCard key={c.id} conf={c} open={openId === c.id || i < 2} onToggle={() => setOpenId(openId === c.id ? null : c.id)} index={i} />
        ))}
      </div>
    </div>
  );
}

function ConferenceCard({ conf, open, onToggle, index }: { conf: Conference; open: boolean; onToggle: () => void; index: number }) {
  const shown = open ? conf.teams : conf.teams.slice(0, 4);
  return (
    <section className="rise overflow-hidden rounded-lg border border-line bg-white shadow-panel" style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 bg-paper px-5 py-4 text-left transition hover:bg-line/40">
        <span className="ghost-numeral w-10 text-3xl">{conf.strengthRank}</span>
        <div>
          <div className="font-display text-lg font-semibold leading-tight">{conf.name}</div>
          <div className="font-stat text-[11px] text-graphite">
            {conf.teams.length} teams · avg SRS {conf.avgSrs != null && conf.avgSrs > 0 ? "+" : ""}
            {conf.avgSrs}
          </div>
        </div>
        <span className="ml-auto font-stat text-[11px] text-court">{open ? "collapse" : "standings"} →</span>
      </button>
      <table className="w-full text-[12.5px]">
        <tbody>
          {shown.map((t) => (
            <tr key={t.id} className="rule-thin">
              <td className="w-8 px-3 py-1.5 text-center font-stat text-[11px] text-graphite">{t.seed ?? "—"}</td>
              <td className="px-2 py-1.5">
                <Link to="/scout/$teamId" params={{ teamId: String(t.id) }} className="inline-flex items-center gap-2 font-medium hover:text-court">
                  <TeamMark team={t} size={18} withName={false} />
                  {t.name}
                  {t.apRank ? <span className="font-stat text-[10px] text-brass">AP {t.apRank}</span> : null}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-right font-stat">{t.confRecord}</td>
              <td className="px-3 py-1.5 text-right font-stat text-graphite">{t.record}</td>
              <td className="w-16 px-3 py-1.5 text-right font-stat text-[11px] text-graphite">{t.srsRank ? `#${t.srsRank}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!open && conf.teams.length > 4 ? (
        <button type="button" onClick={onToggle} className="block w-full bg-paper py-1.5 text-center font-stat text-[11px] text-graphite transition hover:text-ink">
          +{conf.teams.length - 4} more
        </button>
      ) : null}
    </section>
  );
}
