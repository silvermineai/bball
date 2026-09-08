import NcaaShooting from "./NcaaShooting";

export const metadata = {
  title: "NCAA player shooting profiles",
  description: "Compare NCAA-derived player shot volume, zone efficiency and distance across historical seasons.",
};

export default function Page() {
  return <NcaaShooting />;
}
