import NcaaHighSchools from "./NcaaHighSchools";

export const metadata = {
  title: "High-school pipeline",
  description: "Explore high schools by roster presence, programs and recorded production.",
};

export default function Page() {
  return <NcaaHighSchools />;
}
