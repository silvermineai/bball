import NcaaCareers from "./NcaaCareers";

export const metadata = {
  title: "NCAA career leaderboard",
  description: "Rank multi-season NCAA-derived player careers by production, workload, shooting, creation and defensive-event rates.",
};

export default function Page() {
  return <NcaaCareers />;
}
