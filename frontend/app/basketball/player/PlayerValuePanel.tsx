"use client";

import { useEffect, useState } from "react";
import { fmt } from "../../_lib/format";

type Metric = "box_bpm" | "box_obpm" | "box_dbpm";
type MetricResult = {
  rows: Array<{
    id: string;
    player?: string | null;
    team?: string | null;
    value: number | null;
  }>;
};

const labels: Record<Metric, string> = {
  box_bpm: "Box BPM",
  box_obpm: "Offensive BPM",
  box_dbpm: "Defensive BPM",
};

/** Look up publisher value by the exact career source ID. */
export default function PlayerValuePanel({ id, season }: { id: string; season: number }) {
  const [values, setValues] = useState<Partial<Record<Metric, number | null>> | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (season < 2006) {
      setValues(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setValues(null);
    setName(null);
    setTeam(null);
    setError("");
    const query = new URLSearchParams({ kind: "players", season: String(season), playerId: id, page: "0" });
    Promise.all(
      (Object.keys(labels) as Metric[]).map(async (metric) => {
        const params = new URLSearchParams(query);
        params.set("metric", metric);
        const response = await fetch(`/api/basketball/research/boutique?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Publisher player value is unavailable.");
        const result = (await response.json()) as MetricResult;
        const row = result.rows.find((candidate) => String(candidate.id) === String(id));
        return [metric, row?.value ?? null, row?.player ?? null, row?.team ?? null] as const;
      }),
    )
      .then((rows) => {
        const next: Partial<Record<Metric, number | null>> = {};
        for (const [metric, value, player, program] of rows) {
          next[metric] = value;
          if (player) setName(player);
          if (program) setTeam(program);
        }
        setValues(next);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [id, season]);

  if (season < 2006 || error || values === null) return null;
  if (!Object.values(values).some((value) => value != null)) return null;

  return (
    <section className="section paper-panel player-value-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Attributed publisher model / {season - 1}–{String(season).slice(-2)}</div>
          <h2>Put the box score beside BPM.</h2>
        </div>
        <span className="note">Source ID {id}</span>
      </div>
      <p className="note">
        {name || "This source identity"}{team ? ` · ${team}` : ""} appears in the retained SportsDataverse player-value release. These are publisher estimates, not Silvermine forecasts, eligibility findings or a join to the separate NCAA identity namespace.
      </p>
      <div className="strip">
        {(Object.keys(labels) as Metric[]).map((metric) => (
          <div key={metric}>
            <strong>{values[metric] == null ? "—" : fmt(values[metric], 2)}</strong>
            <span>{labels[metric]}</span>
          </div>
        ))}
      </div>
      <p className="note" style={{ marginTop: 18 }}>
        <a href="https://github.com/sportsdataverse/sportsdataverse-data/releases" target="_blank" rel="noreferrer">
          Open the attributed publisher release ↗
        </a>
        {" · "}Use the player-value archive for other seasons and qualification filters.
      </p>
    </section>
  );
}
