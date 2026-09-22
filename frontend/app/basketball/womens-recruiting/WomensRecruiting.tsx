"use client";

import { useMemo, useState } from "react";
import { downloadCsv, toCsv, type CsvCell } from "../../_lib/csv";
import {
  rankWomensRecruitingProspects,
  womensRecruitingGradeBands,
  womensRecruitingPositionSupply,
  type WomensRecruitingProspect,
  type WomensRecruitingHistory,
  type WomensRecruitingRelease,
} from "../../_lib/womens-recruiting-intel";

const positions = ["PG", "SG", "SF", "PF", "C"] as const;

function display(value: string | number | null | undefined) {
  return value == null || value === "" ? "—" : String(value);
}

function capturedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

function exportRows(records: readonly WomensRecruitingProspect[], release: WomensRecruitingRelease): CsvCell[][] {
  return records.map((record) => [
    release.season,
    record.athlete_id,
    record.name,
    record.position ?? null,
    record.rank ?? null,
    record.grade ?? null,
    record.status ?? null,
    record.committed_team_id ?? null,
    record.committed_team_name ?? null,
    record.high_school ?? null,
    record.hometown ?? null,
    record.height_inches ?? null,
    record.weight_pounds && record.weight_pounds > 0 ? record.weight_pounds : null,
    release.edition,
    release.captured_at,
    release.source.list_sha256,
  ]);
}

export default function WomensRecruiting({ release: initialRelease, history }: { release: WomensRecruitingRelease; history?: WomensRecruitingHistory | null }) {
  const [season, setSeason] = useState(initialRelease.season);
  const release = history?.releases.find((item) => item.season === season) ?? initialRelease;
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");
  const [showRows, setShowRows] = useState<25 | 50 | 100>(25);
  const statuses = useMemo(
    () => [...new Set(release.records.map((record) => record.status || "Status unavailable"))].sort(),
    [release.records],
  );
  const positionSupply = useMemo(() => womensRecruitingPositionSupply(release.records), [release.records]);
  const gradeBands = useMemo(() => womensRecruitingGradeBands(release.records), [release.records]);
  const gradeLeaders = useMemo(() => rankWomensRecruitingProspects(release.records, "", 10), [release.records]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rankWomensRecruitingProspects(
      release.records.filter((record) =>
        (!position || record.position === position)
        && (!status || (record.status || "Status unavailable") === status)
        && (!needle || `${record.name} ${record.high_school || ""} ${record.hometown || ""} ${record.athlete_id}`.toLowerCase().includes(needle)),
      ),
      "",
      release.records.length,
    );
  }, [position, query, release.records, status]);
  const visible = filtered.slice(0, showRows);

  return <>
    <div className="page-title">
      <div className="eyebrow">Women&apos;s basketball · recruiting</div>
      <h1>Keep the women&apos;s class in its own ledger.</h1>
      <p>Search the retained {release.season} prospect release by player, position and recorded status. Source fields stay separate from college roster identity, eligibility and future role.</p>
      {history && history.releases.length > 1 ? <label className="control" style={{ display: "inline-flex", marginTop: 16, maxWidth: 220 }}><span>RECRUITING CLASS</span><select aria-label="Women's recruiting class" value={release.season} onChange={(event) => setSeason(Number(event.target.value))}>{history.releases.map((item) => <option key={item.season} value={item.season}>{item.season}</option>)}</select></label> : null}
    </div>
    <section className="stat-strip" aria-label="Women's recruiting coverage">
      <div><strong>{release.coverage.prospects.toLocaleString()}</strong><span>Prospects</span></div>
      <div><strong>{release.coverage.graded.toLocaleString()}</strong><span>With grade</span></div>
      <div><strong>{release.coverage.ranked.toLocaleString()}</strong><span>With rank</span></div>
      <div><strong>{release.coverage.committed.toLocaleString()}</strong><span>Recorded destinations</span></div>
    </section>
    {positionSupply.length > 0 ? <section className="paper-panel recruiting-class-table" aria-labelledby="womens-recruiting-position-supply" style={{ marginBottom: 24 }}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">Position supply · exact source IDs</div>
          <h2 id="womens-recruiting-position-supply">See the class shape before opening a prospect.</h2>
        </div>
        <span className="note">{positionSupply.length} recorded position groups</span>
      </div>
      <p className="note">Status counts repeat the publisher&apos;s retained labels. “Verbal” is planning context only; without a destination ID it does not establish a school commitment, enrollment or roster join.</p>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Position</th><th className="numeric">Prospects</th>{statuses.map((value) => <th className="numeric" key={value}>{value}</th>)}<th className="numeric">Destination IDs</th></tr></thead>
          <tbody>{positionSupply.map((row) => <tr key={row.position}>
            <th scope="row">{row.position}</th>
            <td className="numeric"><strong>{row.prospects.toLocaleString()}</strong></td>
            {statuses.map((value) => <td className="numeric" key={`${row.position}-${value}`}>{(row.statuses.find((item) => item.status === value)?.prospects || 0).toLocaleString()}</td>)}
            <td className="numeric">{row.destinationIds.toLocaleString()}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section> : null}
    <section className="section two-col" aria-label="Women's source grade profile">
      <article className="paper-panel recruiting-class-table">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Source grade profile · class {release.season}</div>
            <h2>See the recorded grade distribution.</h2>
          </div>
          <span className="note">{release.coverage.graded.toLocaleString()} graded rows</span>
        </div>
        <p className="note">These bands summarize the recorded grade field. They are descriptive data buckets, not a Silvermine rank or a projection. Missing grades remain unavailable.</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Source grade</th><th className="numeric">Prospects</th><th className="numeric">Share</th></tr></thead>
            <tbody>{gradeBands.map((band) => <tr key={band.label}><th scope="row">{band.label}</th><td className="numeric">{band.prospects.toLocaleString()}</td><td className="numeric">{band.share == null ? "—" : `${(band.share * 100).toFixed(1)}%`}</td></tr>)}</tbody>
          </table>
        </div>
      </article>
      <article className="paper-panel recruiting-class-table">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Highest recorded source grades</div>
            <h2>Start with the strongest graded rows.</h2>
          </div>
          <span className="note">No national rank inferred</span>
        </div>
        <p className="note">Rows are ordered by recorded grade, then name and athlete ID. Ties stay ties; the table does not manufacture ordinal ranks. The current release carries no source-ranked national ranks or destination IDs.</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Prospect</th><th>Position</th><th className="numeric">Source grade</th><th>Status</th><th>Destination</th></tr></thead>
            <tbody>{gradeLeaders.map((record) => <tr key={record.athlete_id}>
              <th scope="row"><strong>{record.name}</strong><small>Athlete ID {record.athlete_id}</small></th>
              <td>{display(record.position)}</td>
              <td className="numeric"><strong>{display(record.grade)}</strong></td>
              <td>{display(record.status)}</td>
              <td>{record.committed_team_name || "Unavailable"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </article>
    </section>
    <section className="section" aria-labelledby="womens-recruiting-board">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Prospect table · class {release.season}</div>
          <h2 id="womens-recruiting-board">Recorded prospect board.</h2>
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={() => downloadCsv(`womens-prospects-${release.season}.csv`, toCsv([
            "Class", "Athlete ID", "Prospect", "Position", "National rank", "Grade", "Status", "Destination ID", "Destination", "High school", "Hometown", "Height (in)", "Weight (lb)", "Release edition", "Captured", "List receipt SHA-256",
          ], exportRows(filtered, release)))}>Download filtered CSV ↓</button>
        </div>
      </div>
      <div className="filter-row" style={{ marginBottom: 16 }}>
        <label className="control"><span>SEARCH</span><input aria-label="Search women's prospects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Player, school or hometown" /></label>
        <label className="control"><span>POSITION</span><select aria-label="Women's prospect position" value={position} onChange={(event) => setPosition(event.target.value)}><option value="">All positions</option>{positions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="control"><span>STATUS</span><select aria-label="Women's prospect status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="control"><span>ROWS</span><select aria-label="Women's prospect rows" value={showRows} onChange={(event) => setShowRows(Number(event.target.value) as typeof showRows)}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
      </div>
      <p className="note">{filtered.length.toLocaleString()} prospects match · sorted by recorded grade, then name. A missing rank or destination remains unavailable.</p>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Prospect</th><th>Position</th><th className="numeric">National rank</th><th className="numeric">Grade</th><th>Status</th><th>Destination</th><th>High school / hometown</th><th className="numeric">Size</th></tr></thead>
          <tbody>{visible.map((record) => <tr key={record.athlete_id}>
            <th scope="row"><strong>{record.name}</strong><small>Athlete ID {record.athlete_id}</small></th>
            <td>{display(record.position)}</td>
            <td className="numeric">{display(record.rank)}</td>
            <td className="numeric">{display(record.grade)}</td>
            <td>{display(record.status)}</td>
            <td>{display(record.committed_team_name)}</td>
            <td>{[record.high_school, record.hometown].filter(Boolean).join(" · ") || "—"}</td>
            <td className="numeric">{record.height_inches == null ? "—" : `${record.height_inches}″`}{record.weight_pounds && record.weight_pounds > 0 ? ` · ${record.weight_pounds} lb` : ""}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {visible.length === 0 ? <p className="empty">No retained prospects match these filters.</p> : null}
      <p className="section-note">Release captured {capturedLabel(release.captured_at)} · edition <code>{release.edition}</code> · list receipt <code>{release.source.list_sha256}</code>. The release currently carries no source-ranked national ranks or committed team IDs; those fields are shown as unavailable.</p>
    </section>
  </>;
}
