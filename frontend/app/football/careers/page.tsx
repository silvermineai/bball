import CareerBrowser from "./CareerBrowser";

export const metadata = {
  title: "College football player careers across seasons",
  description: "Search identified college football player records across nine SportsDataverse source seasons, with category-specific EPA, workload and team history.",
  alternates: { canonical: "/football/careers/" },
};

export default function Page() {
  return <><div className="page-title"><div className="eyebrow">Football player archive / Cross-season index</div><h1>Follow the player<br /><em>through the seasons.</em></h1><p>Search the identified source archive once, then compare a player&apos;s recorded workload and category-specific production across seasons. Passing, rushing and receiving remain separate source lenses; no composite EPA is invented.</p></div><CareerBrowser /></>;
}
