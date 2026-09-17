import Link from "next/link";
import RecruitingDesk from "./RecruitingDesk";

type PersonnelPreview = {
  id?: string | null;
  name?: string | null;
  team?: string | null;
  position?: string | null;
  experience?: string | null;
  status?: string | null;
  height?: number | null;
  weight?: number | null;
};

async function getPersonnelPreview(): Promise<PersonnelPreview[]> {
  const origin = process.env.PUBLIC_SITE_URL || "https://bball.silvermine.dev";
  try {
    const response = await fetch(
      `${origin.replace(/\/$/, "")}/api/football/recruiting?view=rosters&season=2026&page=0&limit=12`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return [];
    const payload = await response.json() as { rows?: PersonnelPreview[] };
    return Array.isArray(payload.rows) ? payload.rows : [];
  } catch {
    return [];
  }
}

export const metadata = {
  title: "College football recruiting and roster context",
  description: "Search attributed college football season rosters, recruiting commitments, team talent and returning production with source receipts.",
  alternates: { canonical: "/football/recruiting/" },
};

export default async function Page() {
  const preview = await getPersonnelPreview();
  return <>
    <p className="note" style={{ marginBottom: 24 }}>Personnel rows stay separate from the production rankings and forecast model. For basketball recruiting, use the <Link href="/basketball/recruiting/">basketball recruiting board →</Link>.</p>
    {preview.length > 0 && <section className="paper-panel" aria-labelledby="football-personnel-preview" style={{ marginBottom: 24 }}>
      <div className="section-heading" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Current personnel / 2026</div>
          <h2 id="football-personnel-preview">Roster rows, already in the page</h2>
        </div>
        <Link href="/football/recruiting/?view=rosters">Open the full personnel desk →</Link>
      </div>
      <p className="note">A compact view of the retained current-season roster release. Use the desk below to search every row, team and personnel view.</p>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Player</th><th>Program</th><th>Position</th><th>Experience</th><th>Status</th><th>Listed size</th></tr></thead>
          <tbody>{preview.map((row, index) => <tr key={`${row.id || row.name || "player"}-${index}`}>
            <th scope="row">{row.id ? <Link href={`/football/player/?id=${encodeURIComponent(row.id)}&season=2026`}>{row.name || row.id} →</Link> : row.name || "Unknown player"}<small>{row.id ? `Athlete ${row.id}` : "No stable athlete ID"}</small></th>
            <td>{row.team || "—"}</td>
            <td>{row.position || "—"}</td>
            <td>{row.experience || "—"}</td>
            <td>{row.status || "—"}</td>
            <td>{row.height == null && row.weight == null ? "—" : `${row.height == null ? "—" : `${row.height} in`} · ${row.weight == null ? "—" : `${row.weight} lb`}`}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
    <RecruitingDesk />
  </>;
}
