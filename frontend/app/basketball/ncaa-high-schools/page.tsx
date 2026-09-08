import NcaaHighSchools from "./NcaaHighSchools";

export const metadata = {
  title: "NCAA high-school pipeline",
  description: "Explore source-attributed high schools by NCAA roster presence, programs and recorded production.",
};

export default function Page() {
  return <NcaaHighSchools />;
}
