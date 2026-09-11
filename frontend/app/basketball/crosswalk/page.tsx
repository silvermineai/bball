import Crosswalk from "./Crosswalk";

export const metadata = {
  title: "Basketball player identity crosswalk",
  description: "Search the attributed ESPN, Fox Sports and Yahoo college basketball player identifier crosswalk.",
  alternates: { canonical: "/basketball/crosswalk/" },
};

export default function Page() {
  return <>
    <div className="page-title">
      <div className="eyebrow">Source identity / Basketball</div>
      <h1>One player file.<br /><em>Every provider key.</em></h1>
      <p>Search the publisher-supplied crosswalk that places ESPN, Fox Sports and Yahoo identifiers beside one another for the 2025–26 source release. Provider namespaces stay explicit so scouting links are useful without inventing NCAA joins.</p>
    </div>
    <Crosswalk />
  </>;
}

