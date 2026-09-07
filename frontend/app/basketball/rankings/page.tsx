import { getBasketball } from "../../_lib/basketball-data";
import Ratings from "../ratings/Ratings";

export const metadata = {
  title: "Basketball power ratings",
  description:
    "Browse native schedule-adjusted basketball ratings, efficiency and four-factor context.",
  alternates: { canonical: "/basketball/ratings/" },
};

export default function Page() {
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">The archived rankings desk</div>
        <h1>Power ratings, with the reasons attached.</h1>
        <p>
          This native route preserves the old rankings link while exposing the
          current adjusted efficiency and four-factor board.
        </p>
      </div>
      <Ratings rows={getBasketball().ratings} />
    </>
  );
}
