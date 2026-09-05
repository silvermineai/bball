import Announcements from "./Announcements";
import { getRecruiting } from "../../_lib/basketball-data";
export const metadata = {
  title: "Basketball recruiting: school announcements and transfer evidence",
  description:
    "Dated 2026–27 school announcements, prior college stats and availability updates. Source-linked recruiting research with explicit coverage limits.",
  alternates: { canonical: "/basketball/recruiting/" },
};
export default function Page() {
  const data = getRecruiting();
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">
          Roster construction / 2026–27 research file
        </div>
        <h1>
          Follow the player.
          <br />
          Keep the evidence.
        </h1>
        <p>
          Who a school announced. Where they played. What the next statement
          changed. Build your recruiting picture from dated sources and recorded
          college production.
        </p>
      </div>
      <Announcements data={data} />
    </>
  );
}
