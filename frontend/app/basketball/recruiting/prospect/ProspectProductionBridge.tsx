"use client";

import { useEffect, useState } from "react";
import { parseProspectProductionRelease, type ProspectProduction } from "../../../_lib/prospect-production";

type BridgeState = {
  release: ReturnType<typeof parseProspectProductionRelease>;
  error: string;
};

const number = (value: number | null | undefined, digits = 1) =>
  value == null ? "—" : value.toFixed(digits);

const percent = (value: number | null | undefined) =>
  value == null ? "—" : `${(value * 100).toFixed(1)}%`;

function ProductionTable({ production }: { production: ProspectProduction }) {
  const rows = [
    ["Games", production.games.toLocaleString()],
    ["MIN/G", number(production.mpg)],
    ["PTS/G", number(production.ppg)],
    ["REB/G", number(production.rpg)],
    ["AST/G", number(production.apg)],
    ["STL/G", number(production.spg)],
    ["BLK/G", number(production.bpg)],
    ["TO/G", number(production.topg)],
    ["eFG%", percent(production.efg)],
    ["TS%", percent(production.ts)],
    ["3P%", percent(production.three_pct)],
    ["FT%", percent(production.ft_pct)],
  ] as const;
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Observed prior production</th><th className="numeric">Value</th></tr></thead><tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td className="numeric"><strong>{value}</strong></td></tr>)}</tbody></table></div>;
}

export default function ProspectProductionBridge({ athleteId, season }: { athleteId: string; season: number }) {
  const [state, setState] = useState<BridgeState>({ release: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ release: null, error: "" });
    fetch(`/api/basketball/research/recruiting?season=${season}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The reviewed production release is unavailable.");
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          const release = parseProspectProductionRelease(payload, season, athleteId);
          if (!release) setState({ release: null, error: "The production release did not pass the exact-ID integrity checks." });
          else setState({ release, error: "" });
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setState({ release: null, error: reason instanceof Error ? reason.message : "The reviewed production release is unavailable." });
        }
      });
    return () => controller.abort();
  }, [athleteId, season]);

  const production = state.release?.production;
  const release = state.release;
  return <section className="section paper-panel" aria-labelledby="prospect-production-title">
    <div className="section-heading" style={{ marginBottom: 12 }}>
      <div><div className="eyebrow">Production handoff / exact source ID</div><h2 id="prospect-production-title">What the retained college record shows.</h2></div>
      <span className="note">No name-only join</span>
    </div>
    <p className="note">This panel displays prior college production only when the ranked prospect&apos;s exact athlete ID appears once in the reviewed production release for the same class season. Missing values stay unavailable; the record does not project future role or eligibility.</p>
    {!state.release && !state.error && <p className="empty" role="status">Checking the exact-ID production release…</p>}
    {state.error && <p className="empty" role="status">{state.error}</p>}
    {state.release && !production && <p className="empty" role="status">No reviewed college production row is linked to athlete ID <code>{athleteId}</code> in this edition. That is unavailable evidence, not a claim that no production exists.</p>}
    {production && <>
      <div className="strip" style={{ marginBottom: 16 }}>
        <div><strong>{production.team}</strong><span>Recorded prior team</span></div>
        <div><strong>{production.season}</strong><span>Production season</span></div>
        <div><strong>{production.games}</strong><span>Games</span></div>
        <div><strong>{number(production.mpg)}</strong><span>Minutes / game</span></div>
      </div>
      <ProductionTable production={production} />
      <p className="note" style={{ marginTop: 12 }}>Edition <span className="source-hash">{release?.edition}</span> · reviewed {release ? new Date(release.reviewedAt).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" }) : "date unavailable"} · exact athlete ID {production.id}. {production.identity_basis}</p>
    </>}
  </section>;
}
