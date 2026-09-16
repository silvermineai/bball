import NcaaCareers from "./NcaaCareers";

export const metadata = {
  title: "College basketball career leaderboard",
  description: "Rank multi-season player careers by production, workload, shooting, creation and defensive-event rates.",
};

export default function Page() {
  return <NcaaCareers />;
}
