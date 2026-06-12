import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard, ExternalLink, PlaySquare } from "lucide-react";
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
  const [playing, setPlaying] = useState<string | null>(null);
  const [onlyBball, setOnlyBball] = useState(true);

  const videos = filmData?.videos ?? [];
  const filtered = useMemo(() => {
    let rows = videos;
    if (team) rows = rows.filter((v) => v.teamIds.includes(team.id));
    if (onlyBball && !team) rows = rows.filter((v) => (v as FilmVideo & { basketball?: boolean }).basketball);
    return rows;
  }, [videos, team, onlyBball]);

  const searchLinks = team
    ? [
        { label: `${team.name} highlights`, q: `${team.name} basketball highlights 2025-26` },
        { label: "Full games", q: `${team.name} mens basketball full game 2025 2026` },
        { label: "March Madness film", q: `${team.name} march madness ${"2026"}` },
        { label: "Press conferences", q: `${team.name} basketball press conference` },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div className="rise rise-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">The Projector</div>
          <h1 className="font-display text-4xl font-semibold">Film Room</h1>
          <p className="mt-2 max-w-xl text-sm text-graphite">
            Latest film from official channels — NCAA March Madness, Big Ten Network, ACC, Big East, Big 12 — matched to teams
            automatically. Pick a team to focus the projector.
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

      {team && searchLinks.length ? (
        <section className="rise rise-2">
          <SectionTitle kicker="Deep cuts" title={`Find more ${team.shortName} film`} right={<Clapperboard size={18} className="text-brass" />} />
          <div className="mt-3 flex flex-wrap gap-2">
            {searchLinks.map((link) => (
              <a
                key={link.label}
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(link.q)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3.5 py-2 text-sm font-medium shadow-panel transition hover:-translate-y-0.5 hover:border-court"
              >
                <ExternalLink size={13} className="text-court" />
                {link.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rise rise-3">
        <SectionTitle
          kicker={`${filtered.length} clips`}
          title={team ? `Official film mentioning ${team.shortName}` : "Latest from the official channels"}
        />
        {filtered.length === 0 ? (
          <p className="mt-4 text-sm text-graphite">
            Nothing in the current official feeds{team ? ` mentions ${team.shortName} — use the search links above` : ""}. Feeds refresh
            with each data pull.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((v) => (
              <figure key={v.videoId} className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
                {playing === v.videoId ? (
                  <iframe
                    className="aspect-video w-full"
                    src={`https://www.youtube-nocookie.com/embed/${v.videoId}?autoplay=1`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <button type="button" className="group relative block aspect-video w-full" onClick={() => setPlaying(v.videoId)}>
                    {v.thumbnail ? (
                      <img src={v.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-full w-full bg-ink" />
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-ink/30 transition group-hover:bg-ink/50">
                      <PlaySquare size={42} className="text-white drop-shadow" />
                    </span>
                  </button>
                )}
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
