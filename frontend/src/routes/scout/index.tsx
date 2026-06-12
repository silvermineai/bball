import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SectionTitle, TeamMark } from "@/components/Annual";
import { insights } from "@/lib/insights";

export const Route = createFileRoute("/scout/")({
  component: ScoutIndex,
});

function ScoutIndex() {
  const { data } = useQuery({ queryKey: ["insights", "teams"], queryFn: insights.teams, staleTime: Infinity });
  const [q, setQ] = useState("");
  const [conf, setConf] = useState("");

  const teams = data?.teams ?? [];
  const conferences = useMemo(
    () => Array.from(new Set(teams.map((t) => t.conference).filter(Boolean))).sort() as string[],
    [teams],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return teams.filter(
      (t) =>
        (!needle || t.name.toLowerCase().includes(needle) || (t.abbrev ?? "").toLowerCase().includes(needle)) &&
        (!conf || t.conference === conf),
    );
  }, [teams, q, conf]);

  return (
    <div className="space-y-6">
      <div className="rise rise-1 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">The Dossiers</div>
          <h1 className="font-display text-4xl font-semibold">Scouting Reports</h1>
          <p className="mt-2 max-w-xl text-sm text-graphite">
            Every Division I program, profiled from real season data: tendencies, four factors, personnel, results, and a plan to beat them.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[14rem_18rem]">
          <select className="rounded-md border-line bg-white text-sm" value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="">All conferences</option>
            {conferences.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="rounded-md border-line bg-white text-sm"
            placeholder="Search teams"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <SectionTitle kicker={`${filtered.length} programs`} title="Open a dossier" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((t, i) => (
          <Link
            key={t.id}
            to="/scout/$teamId"
            params={{ teamId: String(t.id) }}
            className="group flex items-center gap-3 rounded-lg border border-line bg-white p-4 shadow-panel transition hover:-translate-y-0.5"
            style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }}
          >
            <TeamMark team={t} size={34} withName={false} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold group-hover:text-court">{t.name}</div>
              <div className="font-stat text-[11px] text-graphite">
                {t.record ?? "—"} · {t.conference ?? ""}
              </div>
            </div>
            <span className="ml-auto font-stat text-[11px] font-semibold text-graphite">
              {t.srsRank != null ? `#${t.srsRank}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
