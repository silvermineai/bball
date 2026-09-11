import Link from "next/link";
import RecruitingDesk from "./RecruitingDesk";

export const metadata = {
  title: "College football recruiting and roster context",
  description: "Search attributed college football season rosters, recruiting commitments, team talent and returning production with source receipts.",
  alternates: { canonical: "/football/recruiting/" },
};

export default function Page() {
  return <><p className="note" style={{ marginBottom: 24 }}>Personnel rows stay separate from the production rankings and forecast model. For basketball recruiting, use the <Link href="/basketball/recruiting/">basketball recruiting board →</Link>.</p><RecruitingDesk /></>;
}
