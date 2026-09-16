import NcaaRosters from "./NcaaRosters";

export const metadata = {
  title: "Roster and recruiting archive",
  description: "Search college basketball roster records by class, position, school and hometown.",
};

export default function Page() {
  return <NcaaRosters />;
}
