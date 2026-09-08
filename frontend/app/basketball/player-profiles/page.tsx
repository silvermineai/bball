import type { Metadata } from "next";
import Profiles from "./Profiles";

export const metadata: Metadata = {
  title: "Basketball player profiles and roster context",
  description: "Browse ESPN-derived men's college basketball player identity and roster context across historical seasons.",
  alternates: { canonical: "/basketball/player-profiles/" },
};

export default function Page() {
  return <Profiles />;
}
