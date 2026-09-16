import Crosswalk from "./Crosswalk";

export const metadata = {
  title: "Basketball player identity crosswalk",
  description: "Search the college basketball player identifier crosswalk.",
  alternates: { canonical: "/basketball/crosswalk/" },
};

export default function Page() {
  return <>
    <div className="page-title">
      <div className="eyebrow">Player identity / Basketball</div>
      <h1>One player file.<br /><em>Every identity key.</em></h1>
      <p>Search the recorded crosswalk that places alternate identifiers beside one another for the 2025–26 archive. Identity namespaces stay explicit so scouting links remain useful without inventing joins.</p>
    </div>
    <Crosswalk />
  </>;
}

