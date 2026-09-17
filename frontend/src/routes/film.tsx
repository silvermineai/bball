import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionTitle, TeamPicker } from "@/components/Annual";
import { insights } from "@/lib/insights";
import type { FilmVideo, TeamIndexEntry } from "@/lib/insights";

export const Route = createFileRoute("/film")({
  component: FilmRoom,
});

function FilmRoom() {
  const { data: filmData } = useQuery({ queryKey: ["insights", "film"], queryFn: insights.film, staleTime: Infinity });
  const { data: teamsData } = useQuery({ queryKey: ["insights", "teams"], queryFn: insights.teams, staleTime: Infinity });
  const [team, setTeam] = useState<TeamIndexEntry | null>(null);
  const [onlyBball, setOnlyBball] = useState(true);

  const videos = filmData?.videos ?? [];
  const filtered = useMemo(() => {
    let rows = videos;
    if (team) rows = rows.filter((v) => v.teamIds.includes(team.id));
    if (onlyBball && !team) rows = rows.filter((v) => (v as FilmVideo & { basketball?: boolean }).basketball);
    return rows;
  }, [videos, team, onlyBball]);

  return (
    <div className="space-y-8">
      <div className="rise rise-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">The Projector</div>
          <h1 className="font-display text-4xl font-semibold">Film Room</h1>
          <p className="mt-2 max-w-xl text-sm text-graphite">
            Retained film records matched to teams automatically. Pick a team to focus the projector.
          </p>
        </div>
        <div className="flex w-full max-w-md items-end gap-3">
          <div className="grow">
            <div className="mb-1 font-stat text-[10px] uppercase tracking-wider text-graphite">Focus on a team</div>
            <TeamPicker teams={teamsData?.teams ?? []} value={team} onChange={setTeam} />
          </div>
          {team ? (
            <button
              type="button"
              className="rounded-md border border-line bg-white px-3 py-2 text-sm transition hover:border-court"
              onClick={() => setTeam(null)}
            >
              Clear
            </button>
          ) : (
            <label className="flex items-center gap-2 pb-2 text-[12px] text-graphite">
              <input type="checkbox" className="rounded border-line" checked={onlyBball} onChange={(e) => setOnlyBball(e.target.checked)} />
              Hoops only
            </label>
          )}
        </div>
      </div>

      {team ? (
        <section className="rise rise-2">
          <SectionTitle kicker="Deep cuts" title={`Film queue for ${team.shortName}`} right={<Clapperboard size={18} className="text-brass" />} />
          <p className="mt-3 text-sm text-graphite">The archive keeps team-matched clip records and identifiers. Playback stays out of the stats workspace so the board remains focused on retained data.</p>
        </section>
      ) : null}

      <section className="rise rise-3">
        <SectionTitle
          kicker={`${filtered.length} clips`}
          title={team ? `Official film mentioning ${team.shortName}` : "Latest from the official channels"}
        />
        {filtered.length === 0 ? (
          <p className="mt-4 text-sm text-graphite">
            Nothing in the current film archive{team ? ` mentions ${team.shortName}` : ""}. The archive refreshes
            with each data pull.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((v) => (
              <figure key={v.videoId} className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
                <div className="grid aspect-video w-full place-items-center bg-ink px-6 text-center text-white">
                  <div><div className="font-stat text-[10px] uppercase tracking-wider text-brass">Retained clip</div><div className="mt-2 text-sm">Video identifier {v.videoId}</div><div className="mt-1 text-xs text-white/70">Playback is not part of this data view.</div></div>
                </div>
                <figcaption className="p-4">
                  <div className="line-clamp-2 text-sm font-semibold leading-snug">{v.title}</div>
                  <div className="mt-1.5 font-stat text-[10px] uppercase tracking-wider text-court">
                    {v.channel} · {v.published ? new Date(v.published).toLocaleDateString() : ""}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
