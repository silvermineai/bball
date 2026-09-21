"use client";

import { useEffect, useMemo, useState } from "react";
import { parseWomensLowerDivisionEdition, type WomensLowerDivisionEdition, type WomensLowerDivisionStatistic } from "../_lib/womens-lower-division-integrity";

type Row = Record<string, string | number | null> & { source_fields?: Record<string, string>; team?: string; team_source_path?: string };
type Statistic = WomensLowerDivisionStatistic & { rows: Row[] };
type Edition = WomensLowerDivisionEdition;

const number = (value: unknown) => value == null || value === "" ? "—" : typeof value === "number" ? Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);

export default function WomensLowerDivisionStats({ division }: { division: "2" | "3" }) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [kind, setKind] = useState<"individual" | "team">("individual");
  const [statistic, setStatistic] = useState("");
  useEffect(() => {
    fetch("/data/basketball/womens-lower-division-stats.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => {
        if (value == null) return;
        try {
          setEdition(parseWomensLowerDivisionEdition(value));
          setIntegrityError(null);
        } catch (error) {
          setEdition(null);
          setIntegrityError(error instanceof Error ? error.message : "The lower-division release failed integrity validation.");
        }
      })
      .catch(() => setEdition(null));
  }, []);
  const current = edition?.divisions?.[division];
  const options = current?.[kind] || [];
  const selected = options.find((item) => item.statistic === statistic) || options[0];
  const rows = useMemo(() => selected?.rows || [], [selected]);
  useEffect(() => {
    if (options.length && !options.some((item) => item.statistic === statistic)) setStatistic(options[0].statistic);
  }, [options, statistic]);
  return <section className="field-card" aria-labelledby="wbb-lower-stats-title" style={{ marginTop: 18 }}>
    <div className="eyebrow">NCAA.COM SOURCE NATIVE · WOMEN&apos;S D{division}</div>
    <h2 id="wbb-lower-stats-title">D{division} leaderboards are now visible</h2>
    {!current ? <p className={integrityError ? "status-error" : "muted"}>{integrityError || "Loading the NCAA.com lower-division tables…"}</p> : <>
      <p className="note">These current-season tables are explicitly scoped by the NCAA.com D{division} route. The source publishes athlete names and team slugs but no athlete IDs, so rows stay separate from the ESPN player identity and forecast editions. {current.identity_note}</p>
      <div className="division-player-controls">
        <label htmlFor="wbb-lower-kind">TABLE TYPE</label>
        <select id="wbb-lower-kind" value={kind} onChange={(event) => setKind(event.target.value as "individual" | "team")}><option value="individual">Individual leaders</option><option value="team">Team metrics</option></select>
        <label htmlFor="wbb-lower-stat">STATISTIC</label>
        <select id="wbb-lower-stat" value={selected?.statistic || ""} onChange={(event) => setStatistic(event.target.value)}>{options.map((item) => <option key={item.statistic} value={item.statistic}>{item.label}</option>)}</select>
      </div>
      {selected ? <><div className="scope-snapshot-counts"><strong>{rows.length.toLocaleString()}</strong><span>retained rows</span><strong>{options.length.toLocaleString()}</strong><span>{kind} statistics</span><strong>{selected.through_games || current.through_games || "—"}</strong><span>through games</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr>{selected.headers.map((header) => <th key={header} className={header === "Rank" || ["PPG", "RPG", "APG", "SPG", "BPG", "MPG", "FG%", "3P%", "FT%"].includes(header) ? "numeric" : ""}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${selected.statistic}-${String(row.rank ?? index)}-${String(row.name ?? row.team ?? index)}`}>{selected.headers.map((header) => { const key = header.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, character) => String(character).toUpperCase()); const value = header === "Team" && row.team ? row.team : row[key]; return <td key={header} className={header === "Rank" || ["PPG", "RPG", "APG", "SPG", "BPG", "MPG", "FG%", "3P%", "FT%"].includes(header) ? "numeric" : ""}>{number(value)}</td>; })}</tr>)}</tbody></table></div>
      </> : <p className="empty">No NCAA.com rows were retained for this table.</p>}
      <p className="muted">Integrity check passed for {edition.receipts.length.toLocaleString()} source receipts and {edition.divisions[division].individual.length + edition.divisions[division].team.length} statistic tables. No player ranking, forecast, or identity join is created from a name-only row.</p>
    </>}
  </section>;
}
