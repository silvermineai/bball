import NcaaRosters from "./NcaaRosters";

export const metadata = {
  title: "NCAA roster and recruiting archive",
  description: "Search NCAA-derived college basketball roster records by class, position, school and hometown.",
};

export default function Page() {
  return <NcaaRosters />;
}
