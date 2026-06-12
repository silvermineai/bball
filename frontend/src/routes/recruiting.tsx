import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Plus, Trash2, UserRoundSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SectionTitle, TeamMark, TeamPicker } from "@/components/Annual";
import { insights } from "@/lib/insights";
import type { RecruitingTeam, TeamIndexEntry } from "@/lib/insights";

export const Route = createFileRoute("/recruiting")({
  component: RecruitingPage,
});

const CLASS_ORDER = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"];
const CLASS_COLORS = ["#9fb8a8", "#769b84", "#567a62", "#c0843e", "#8a5a28"];

type Target = {
  id: string;
  name: string;
  position: string;
  source: string; // portal / HS / JUCO / intl
  priority: "A" | "B" | "C";
  notes: string;
};

const TARGETS_KEY = "silvermine.recruiting.targets";

function loadTargets(): Target[] {
  try {
    return JSON.parse(localStorage.getItem(TARGETS_KEY) ?? "[]") as Target[];
  } catch {
    return [];
  }
}

function RecruitingPage() {
  const { data: recruitingData } = useQuery({ queryKey: ["insights", "recruiting"], queryFn: insights.recruiting, staleTime: Infinity });
  const { data: teamsData } = useQuery({ queryKey: ["insights", "teams"], queryFn: insights.teams, staleTime: Infinity });
  const { data: newsData } = useQuery({ queryKey: ["insights", "news"], queryFn: insights.news, staleTime: Infinity });

  const [myTeam, setMyTeam] = useState<TeamIndexEntry | null>(null);
  const [sort, setSort] = useState<"departing" | "rank">("departing");
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    setTargets(loadTargets());
    const savedTeam = localStorage.getItem("silvermine.recruiting.myTeam");
    if (savedTeam && teamsData?.teams) {
      const t = teamsData.teams.find((x) => x.id === Number(savedTeam));
      if (t) setMyTeam(t);
    }
  }, [teamsData]);

  function saveTargets(next: Target[]) {
    setTargets(next);
    localStorage.setItem(TARGETS_KEY, JSON.stringify(next));
  }

  const allRecruiting = recruitingData?.teams ?? [];
  const myRoom = myTeam ? allRecruiting.find((t) => t.id === myTeam.id) : null;

  const board = useMemo(() => {
    const rows = [...allRecruiting];
    if (sort === "departing") rows.sort((a, b) => b.departingShare - a.departingShare);
    else rows.sort((a, b) => (a.srsRank ?? 999) - (b.srsRank ?? 999));
    return rows;
  }, [allRecruiting, sort]);

  const recruitingNews = (newsData?.articles ?? []).filter((a) =>
    /recruit|transfer|portal|commit|sign|class of|prospect/i.test(`${a.headline} ${a.description}`),
  );

  return (
    <div className="space-y-10">
      <div className="rise rise-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] of text-court">Roster Construction</div>
          <h1 className="font-display text-4xl font-semibold">Recruiting Board</h1>
          <p className="mt-2 max-w-xl text-sm text-graphite">
            Who's leaving, what holes open up, and which programs across the country face the same questions. Built from real roster
            data — class years, positions, and departing production.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <div className="mb-1 font-stat text-[10px] uppercase tracking-wider text-graphite">Your program</div>
          <TeamPicker
            teams={teamsData?.teams ?? []}
            value={myTeam}
            onChange={(t) => {
              setMyTeam(t);
              localStorage.setItem("silvermine.recruiting.myTeam", String(t.id));
            }}
          />
        </div>
      </div>

      {/* my room */}
      {myRoom ? (
        <section className="rise rise-2 print-block grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-lg border border-line bg-white p-6 shadow-panel">
            <div className="flex items-center gap-3">
              <TeamMark team={myRoom} size={40} withName={false} />
              <div>
                <div className="font-display text-2xl font-semibold">{myRoom.name}</div>
                <div className="font-stat text-[12px] text-graphite">
                  {myRoom.rosterSize} on roster · No. {myRoom.srsRank} power rating
                </div>
              </div>
              <Link
                to="/scout/$teamId"
                params={{ teamId: String(myRoom.id) }}
                className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm transition hover:border-court"
              >
                Dossier →
              </Link>
            </div>
            <div className="mt-5 flex h-5 overflow-hidden rounded-sm">
              {CLASS_ORDER.filter((c) => myRoom.classBreakdown[c]).map((c, i) => (
                <div
                  key={c}
                  title={`${c}: ${myRoom.classBreakdown[c]}`}
                  style={{ width: `${(100 * (myRoom.classBreakdown[c] ?? 0)) / myRoom.rosterSize}%`, background: CLASS_COLORS[CLASS_ORDER.indexOf(c)] }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-stat text-[11px] text-graphite">
              {CLASS_ORDER.filter((c) => myRoom.classBreakdown[c]).map((c) => (
                <span key={c}>
                  {c} <b>{myRoom.classBreakdown[c]}</b>
                </span>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Figure label="Departing" value={myRoom.departingCount} sub={`${myRoom.departingShare}% of roster`} />
              <Figure label="Departing starters/leaders" value={myRoom.departingStarCount} sub="among team statistical leaders" />
              <Figure label="Needs" value={myRoom.positionalNeeds.length ? myRoom.positionalNeeds.join(" · ") : "—"} sub="positions losing 50%+ depth" />
            </div>
            {myRoom.departingNames.length ? (
              <div className="mt-5">
                <div className="font-stat text-[10px] uppercase tracking-[0.2em] text-court">Walking out the door</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {myRoom.departingNames.map((p) => (
                    <span key={p.name} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1 text-[12px]">
                      <GraduationCap size={13} className="text-brass" />
                      {p.name}
                      <span className="font-stat text-[10px] text-graphite">{p.position}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* target tracker */}
          <div className="rounded-lg border border-line bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-stat text-[10px] uppercase tracking-[0.2em] text-court">Your board</div>
                <div className="font-display text-xl font-semibold">Target tracker</div>
              </div>
              <UserRoundSearch size={18} className="text-court" />
            </div>
            <TargetForm onAdd={(t) => saveTargets([...targets, t])} />
            <div className="mt-4 space-y-2">
              {targets.length === 0 ? (
                <p className="text-[13px] text-graphite">No targets yet. Add portal entrants, high-school prospects, or JUCO finds — stored privately in your browser.</p>
              ) : (
                targets
                  .sort((x, y) => x.priority.localeCompare(y.priority))
                  .map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-md border border-line bg-paper px-3 py-2">
                      <span
                        className={`grid h-5 w-5 place-items-center rounded font-stat text-[10px] font-bold text-white ${
                          t.priority === "A" ? "bg-make" : t.priority === "B" ? "bg-court" : "bg-graphite"
                        }`}
                      >
                        {t.priority}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{t.name}</div>
                        <div className="font-stat text-[11px] text-graphite">
                          {t.position} · {t.source}
                          {t.notes ? ` · ${t.notes}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ml-auto text-graphite transition hover:text-miss"
                        onClick={() => saveTargets(targets.filter((x) => x.id !== t.id))}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="rise rise-2 rounded-lg border border-dashed border-line bg-white/60 p-8 text-center text-sm text-graphite">
          Pick your program above to see your roster runway and build a target board.
        </section>
      )}

      {/* national board */}
      <section className="rise rise-3">
        <SectionTitle
          kicker="The Market"
          title="Roster turnover across the country"
          right={
            <select className="rounded-md border-line bg-white text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="departing">Most roster turnover</option>
              <option value="rank">Best teams first</option>
            </select>
          }
        />
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-white shadow-panel">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="bg-paper font-stat text-[10px] uppercase tracking-wider text-graphite">
                <th className="px-3 py-2 text-left">Program</th>
                <th className="px-3 py-2 text-left">Conference</th>
                <th className="px-3 py-2 text-center">Power</th>
                <th className="px-3 py-2 text-left">Class mix</th>
                <th className="px-3 py-2 text-center">Departing</th>
                <th className="px-3 py-2 text-center">Leaders lost</th>
                <th className="px-3 py-2 text-left">Needs</th>
              </tr>
            </thead>
            <tbody>
              {board.slice(0, 80).map((t) => (
                <BoardRow key={t.id} t={t} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-graphite">Top 80 shown. Departures = seniors + graduates on the final roster; eligibility waivers not modeled.</p>
      </section>

      {/* recruiting wire */}
      <section className="rise rise-4">
        <SectionTitle kicker="The Wire" title="Recruiting & portal news" />
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {recruitingNews.slice(0, 9).map((a) => (
            <a
              key={a.id}
              href={a.link ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-line bg-white p-4 shadow-panel transition hover:-translate-y-0.5"
            >
              <div className="text-sm font-semibold leading-snug">{a.headline}</div>
              <div className="mt-1 line-clamp-2 text-[12px] text-graphite">{a.description}</div>
              <div className="mt-2 font-stat text-[10px] uppercase tracking-wider text-court">
                ESPN · {a.published ? new Date(a.published).toLocaleDateString() : ""}
              </div>
            </a>
          ))}
          {recruitingNews.length === 0 ? <p className="text-sm text-graphite">No recruiting stories in the current feed.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="border-l-2 border-brass pl-3">
      <div className="font-stat text-[10px] uppercase tracking-[0.18em] text-graphite">{label}</div>
      <div className="font-display text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-[11px] text-graphite">{sub}</div> : null}
    </div>
  );
}

function BoardRow({ t }: { t: RecruitingTeam }) {
  return (
    <tr className="rule-thin">
      <td className="px-3 py-2">
        <Link to="/scout/$teamId" params={{ teamId: String(t.id) }} className="inline-flex items-center gap-2 font-medium hover:text-court">
          <TeamMark team={t} size={20} withName={false} />
          {t.name}
        </Link>
      </td>
      <td className="px-3 py-2 text-graphite">{t.conference}</td>
      <td className="px-3 py-2 text-center font-stat">{t.srsRank ? `#${t.srsRank}` : "—"}</td>
      <td className="px-3 py-2">
        <div className="flex h-3 w-32 overflow-hidden rounded-sm">
          {CLASS_ORDER.filter((c) => t.classBreakdown[c]).map((c) => (
            <div
              key={c}
              title={`${c}: ${t.classBreakdown[c]}`}
              style={{ width: `${(100 * (t.classBreakdown[c] ?? 0)) / t.rosterSize}%`, background: CLASS_COLORS[CLASS_ORDER.indexOf(c)] }}
            />
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-center font-stat">
        {t.departingCount} <span className="text-[10px] text-graphite">({t.departingShare}%)</span>
      </td>
      <td className="px-3 py-2 text-center font-stat">{t.departingStarCount || "—"}</td>
      <td className="px-3 py-2 font-stat text-[11px]">{t.positionalNeeds.join(" · ") || "—"}</td>
    </tr>
  );
}

function TargetForm({ onAdd }: { onAdd: (t: Target) => void }) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("G");
  const [source, setSource] = useState("Portal");
  const [priority, setPriority] = useState<"A" | "B" | "C">("A");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="mt-4 grid grid-cols-[1fr_4.5rem] gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd({ id: crypto.randomUUID(), name: name.trim(), position, source, priority, notes: notes.trim() });
        setName("");
        setNotes("");
      }}
    >
      <input className="rounded-md border-line bg-paper text-sm" placeholder="Player name" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="rounded-md border-line bg-paper text-sm" value={position} onChange={(e) => setPosition(e.target.value)}>
        {["G", "F", "C"].map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-md border-line bg-paper text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
          {["Portal", "High school", "JUCO", "International"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="rounded-md border-line bg-paper text-sm" value={priority} onChange={(e) => setPriority(e.target.value as "A" | "B" | "C")}>
          {["A", "B", "C"].map((p) => (
            <option key={p} value={p}>
              Priority {p}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="grid place-items-center rounded-md bg-ink text-white transition hover:bg-graphite">
        <Plus size={16} />
      </button>
      <input
        className="col-span-2 rounded-md border-line bg-paper text-sm"
        placeholder="Notes (shooting, defense, fit…)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </form>
  );
}
