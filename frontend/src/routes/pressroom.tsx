import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Copy, Feather, Quote } from "lucide-react";
import { useState } from "react";
import { SectionTitle, TeamMark, TeamPicker } from "@/components/Annual";
import { buildGameKeys, insights } from "@/lib/insights";
import type { TeamIndexEntry } from "@/lib/insights";

type PressSearch = { team?: number; opp?: number };

export const Route = createFileRoute("/pressroom")({
  component: PressRoom,
  validateSearch: (search: Record<string, unknown>): PressSearch => ({
    team: search.team ? Number(search.team) : undefined,
    opp: search.opp ? Number(search.opp) : undefined,
  }),
});

function PressRoom() {
  const navigate = useNavigate({ from: "/pressroom" });
  const { team, opp } = Route.useSearch();
  const { data: teamsData } = useQuery({ queryKey: ["insights", "teams"], queryFn: insights.teams, staleTime: Infinity });
  const teams = teamsData?.teams ?? [];
  const teamEntry = teams.find((t) => t.id === team) ?? null;
  const oppEntry = teams.find((t) => t.id === opp) ?? null;

  const scouts = useQueries({
    queries: [team, opp].map((id) => ({
      queryKey: ["insights", "scout", String(id)],
      queryFn: () => insights.scout(id!),
      enabled: id != null,
      staleTime: Infinity,
    })),
  });
  const scout = team != null ? scouts[0]?.data : undefined;
  const oppScout = opp != null ? scouts[1]?.data : undefined;

  const previewKeys = scout && oppScout ? buildGameKeys(scout, oppScout) : [];

  return (
    <div className="space-y-8">
      <div className="rise rise-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">For the writers</div>
          <h1 className="font-display text-4xl font-semibold">Press Room</h1>
          <p className="mt-2 max-w-xl text-sm text-graphite">
            Deadline fuel: storylines, stat nuggets with national context, and a ready-to-edit article opener — all generated from real
            season data. Add an opponent for game-preview angles.
          </p>
        </div>
        <div className="grid items-end gap-2 sm:grid-cols-2">
          <div className="w-full sm:w-64">
            <div className="mb-1 font-stat text-[10px] uppercase tracking-wider text-graphite">Covering</div>
            <TeamPicker teams={teams} value={teamEntry} onChange={(t) => navigate({ search: (prev) => ({ ...prev, team: t.id }), resetScroll: false })} />
          </div>
          <div className="w-full sm:w-64">
            <div className="mb-1 font-stat text-[10px] uppercase tracking-wider text-graphite">Opponent (optional)</div>
            <TeamPicker teams={teams} value={oppEntry} onChange={(t) => navigate({ search: (prev) => ({ ...prev, opp: t.id }), resetScroll: false })} />
          </div>
        </div>
      </div>

      {!scout ? (
        <section className="rise rise-2 rounded-lg border border-dashed border-line bg-white/60 p-10 text-center text-sm text-graphite">
          Pick the team you're covering to generate the press kit.
        </section>
      ) : (
        <>
          {/* dateline header */}
          <section className="rise rise-2 flex items-center gap-4 rounded-lg border border-line bg-white p-5 shadow-panel">
            <TeamMark team={scout.identity} size={44} withName={false} />
            <div>
              <div className="font-display text-2xl font-semibold">{scout.identity.name}</div>
              <div className="font-stat text-[12px] text-graphite">
                {scout.identity.record} · {scout.identity.conference}
                {scout.identity.apRank ? ` · Final AP No. ${scout.identity.apRank}` : ""}
              </div>
            </div>
            <Link
              to="/scout/$teamId"
              params={{ teamId: String(scout.identity.id) }}
              className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm transition hover:border-court"
            >
              Full dossier →
            </Link>
          </section>

          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <section className="rise rise-3 space-y-8">
              <div>
                <SectionTitle kicker="Angles" title="Storylines" right={<Feather size={18} className="text-brass" />} />
                <ol className="mt-3 space-y-2.5">
                  {scout.press.storylines.map((s, i) => (
                    <CopyLine key={i} text={s} index={i + 1} />
                  ))}
                </ol>
              </div>

              {previewKeys.length ? (
                <div>
                  <SectionTitle kicker={`vs ${oppScout?.identity.shortName}`} title="Game preview angles" />
                  <ol className="mt-3 space-y-2.5">
                    {previewKeys.map((k, i) => (
                      <CopyLine key={i} text={`${k.title}: ${k.detail}`} index={i + 1} />
                    ))}
                  </ol>
                </div>
              ) : null}

              <div>
                <SectionTitle kicker="Lede" title="Article starter" />
                <ArticleStarter text={scout.press.articleStarter} />
              </div>
            </section>

            <section className="rise rise-4">
              <SectionTitle kicker="Numbers that talk" title="Stat nuggets" right={<Quote size={18} className="text-court" />} />
              <div className="mt-3 space-y-3">
                {scout.press.nuggets.map((n, i) => (
                  <blockquote key={i} className="relative rounded-lg border border-line bg-white p-5 shadow-panel">
                    <Quote size={28} className="absolute -top-2.5 left-4 rotate-180 text-brass/30" />
                    <p className="font-display text-[15px] italic leading-relaxed">{n}</p>
                    <CopyButton text={n} className="absolute bottom-3 right-3" />
                  </blockquote>
                ))}
              </div>

              <div className="mt-8">
                <SectionTitle kicker="Context" title="Fast facts" />
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <Fact label="Power rating" value={`No. ${scout.identity.srsRank}`} />
                  <Fact label="vs AP Top 25" value={scout.identity.vsApRecord ?? "—"} />
                  <Fact label="Home" value={scout.identity.homeRecord ?? "—"} />
                  <Fact label="Road" value={scout.identity.awayRecord ?? "—"} />
                  <Fact label="Last 10" value={scout.last10Record} />
                  <Fact
                    label="Avg home crowd"
                    value={scout.identity.avgHomeAttendance ? scout.identity.avgHomeAttendance.toLocaleString() : "—"}
                  />
                </dl>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function CopyLine({ text, index }: { text: string; index: number }) {
  return (
    <li className="group flex items-start gap-3 rounded-md border border-line bg-white px-4 py-3 shadow-panel">
      <span className="ghost-numeral text-2xl">{index}</span>
      <span className="pt-0.5 text-[13.5px] leading-relaxed">{text}</span>
      <CopyButton text={text} className="ml-auto mt-0.5 opacity-0 transition group-hover:opacity-100" />
    </li>
  );
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      className={`shrink-0 text-graphite transition hover:text-ink ${className}`}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check size={15} className="text-make" /> : <Copy size={15} />}
    </button>
  );
}

function ArticleStarter({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-line bg-ink p-6 text-paper shadow-panel grain relative">
      <p className="relative font-display text-[15px] leading-[1.8]">
        <span className="float-left mr-2 font-display text-5xl font-bold leading-[0.85] text-brass">{text.charAt(0)}</span>
        {text.slice(1)}
      </p>
      <button
        type="button"
        className="relative mt-4 inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-1.5 text-sm transition hover:bg-white/10"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check size={14} className="text-make" /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy lede"}
      </button>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3 shadow-panel">
      <dt className="font-stat text-[10px] uppercase tracking-[0.18em] text-graphite">{label}</dt>
      <dd className="font-display text-xl font-semibold">{value}</dd>
    </div>
  );
}
