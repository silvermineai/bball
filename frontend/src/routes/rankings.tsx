import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TeamMark } from "@/components/Annual";
import { insights } from "@/lib/insights";
import type { RatingsRow } from "@/lib/insights";

export const Route = createFileRoute("/rankings")({
  component: RankingsPage,
});

type SortKey = keyof Pick<
  RatingsRow,
  "rank" | "srs" | "sos" | "offEff" | "defEff" | "pace" | "efg" | "tovPct" | "orbPct" | "ftRate" | "threePct" | "netMargin"
>;

const COLUMNS: { key: SortKey; label: string; title: string; lowGood?: boolean }[] = [
  { key: "srs", label: "SRS", title: "Simple Rating System: schedule-adjusted scoring margin (home-court adjusted, blowouts capped)" },
  { key: "sos", label: "SOS", title: "Strength of schedule: average opponent SRS" },
  { key: "offEff", label: "Off", title: "Points scored per 100 possessions" },
  { key: "defEff", label: "Def", title: "Points allowed per 100 possessions", lowGood: true },
  { key: "pace", label: "Pace", title: "Possessions per game" },
  { key: "efg", label: "eFG%", title: "Effective field-goal percentage" },
  { key: "tovPct", label: "TO%", title: "Turnovers per 100 possessions", lowGood: true },
  { key: "orbPct", label: "ORB%", title: "Offensive rebound rate" },
  { key: "ftRate", label: "FTR", title: "Free-throw attempts per 100 field-goal attempts" },
  { key: "threePct", label: "3P%", title: "Three-point percentage" },
];

function RankingsPage() {
  const { data } = useQuery({ queryKey: ["insights", "ratings"], queryFn: insights.ratings, staleTime: Infinity });
  const [q, setQ] = useState("");
  const [conf, setConf] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [desc, setDesc] = useState(false);

  const board = data?.board ?? [];
  const conferences = useMemo(() => Array.from(new Set(board.map((t) => t.conference).filter(Boolean))).sort() as string[], [board]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = board.filter(
      (t) => (!needle || t.name.toLowerCase().includes(needle)) && (!conf || t.conference === conf),
    );
    if (sortKey !== "rank") {
      out = [...out].sort((a, b) => {
        const va = a[sortKey] ?? -Infinity;
        const vb = b[sortKey] ?? -Infinity;
        return desc ? (vb as number) - (va as number) : (va as number) - (vb as number);
      });
    }
    return out;
  }, [board, q, conf, sortKey, desc]);

  function clickSort(key: SortKey, lowGood?: boolean) {
    if (sortKey === key) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(!lowGood);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rise rise-1 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">Beyond the polls</div>
          <h1 className="font-display text-4xl font-semibold">Power Ratings</h1>
          <p className="mt-2 max-w-2xl text-sm text-graphite">
            All {board.length} Division I teams rated by schedule-adjusted scoring margin (SRS), with the four factors that explain why.
            Click any column to sort; hover headers for definitions.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[13rem_15rem]">
          <select className="rounded-md border-line bg-white text-sm" value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="">All conferences</option>
            {conferences.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input className="rounded-md border-line bg-white text-sm" placeholder="Search teams" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="rise rise-2 overflow-x-auto rounded-lg border border-line bg-white shadow-panel">
        <table className="w-full min-w-[860px] text-[12.5px]">
          <thead>
            <tr className="bg-paper font-stat text-[10px] uppercase tracking-wider text-graphite">
              <th className="cursor-pointer px-3 py-2.5 text-left" onClick={() => clickSort("rank", true)}>
                Rk
              </th>
              <th className="px-3 py-2.5 text-left">Team</th>
              <th className="px-3 py-2.5 text-left">Record</th>
              <th className="px-3 py-2.5 text-center">AP</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className={`cursor-pointer px-3 py-2.5 text-right transition hover:text-ink ${sortKey === c.key ? "text-ink" : ""}`}
                  onClick={() => clickSort(c.key, c.lowGood)}
                >
                  {c.label}
                  {sortKey === c.key ? (desc ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="rule-thin transition hover:bg-paper">
                <td className="px-3 py-2 font-stat font-semibold text-graphite">{t.rank}</td>
                <td className="px-3 py-2">
                  <Link to="/scout/$teamId" params={{ teamId: String(t.id) }} className="inline-flex items-center gap-2 font-medium hover:text-court">
                    <TeamMark team={t} size={20} withName={false} />
                    {t.name}
                    <span className="hidden font-stat text-[10px] text-graphite lg:inline">{t.conference}</span>
                  </Link>
                </td>
                <td className="px-3 py-2 font-stat">{t.record}</td>
                <td className="px-3 py-2 text-center font-stat text-graphite">{t.apRank ?? ""}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right font-stat tabular-nums">
                    {c.key === "srs" && t.srs > 0 ? "+" : ""}
                    {t[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-graphite">
        Ratings computed from {data ? new Date(data.updated).toLocaleDateString() : ""} data · {data?.season} season · scores via ESPN
        public APIs, ratings methodology: iterative SRS with {`±28`}-point margin cap and 3.2-point home-court adjustment.
      </p>
    </div>
  );
}
