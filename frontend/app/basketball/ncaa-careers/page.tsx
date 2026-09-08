import NcaaCareers from "./NcaaCareers";

export const metadata = {
  title: "NCAA career leaderboard",
  description: "Rank multi-season NCAA-derived player careers by production, workload and scoring efficiency.",
};

export default function Page() {
  return <NcaaCareers />;
}
