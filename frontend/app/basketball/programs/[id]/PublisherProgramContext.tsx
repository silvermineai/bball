"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "../../../_lib/format";

type PublisherRow = { id: string; team: string; value: number | null };

export default function PublisherProgramContext({
  teamId,
  programName,
}: {
  teamId: string;
  programName: string;
}) {
  const [row, setRow] = useState<PublisherRow | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      kind: "ratings",
      season: "2026",
      metric: "adj_em",
      ids: teamId,
    });
    fetch(`/api/basketball/research/boutique?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("publisher context unavailable");
        return response.json() as Promise<{ rows?: PublisherRow[] }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setRow(payload.rows?.find((candidate) => candidate.id === teamId) || null);
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("unavailable");
        }
      });
    return () => controller.abort();
  }, [teamId]);

  return (
    <section className="section paper-panel" aria-labelledby="publisher-program-context-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Publisher lens / exact source team ID</div>
          <h2 id="publisher-program-context-title">A second read on {programName}.</h2>
        </div>
        <Link className="text-link" href={`/basketball/boutique/?kind=ratings&season=2026&metric=adj_em&q=${encodeURIComponent(programName)}`}>
          Open model archive ↗
        </Link>
      </div>
      {status === "checking" ? (
        <p className="empty" role="status">Checking the attributed publisher rating…</p>
      ) : status === "unavailable" ? (
        <p className="note" role="status">Publisher context is temporarily unavailable. The independent Silvermine dossier remains available.</p>
      ) : row ? (
        <>
          <div className="strip">
            <div><strong>{fmt(row.value, 1)}</strong><span>Publisher adjusted efficiency margin</span></div>
            <div><strong>2025–26</strong><span>Source season</span></div>
            <div><strong>{row.id}</strong><span>Exact source team ID</span></div>
          </div>
          <p className="note" style={{ marginTop: 16 }}>
            This value is preserved from the attributed SportsDataverse publisher release. It is a separate descriptive lens and does not feed the Silvermine forecast, roster scenario or eligibility assessment.
          </p>
        </>
      ) : (
        <p className="note" role="status">No publisher rating row matched this exact source team ID in the 2025–26 release.</p>
      )}
    </section>
  );
}
