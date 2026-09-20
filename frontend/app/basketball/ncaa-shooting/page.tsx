import { Suspense } from "react";
import NcaaShooting from "./NcaaShooting";

export const metadata = {
  title: "Player shooting profiles",
  description: "Compare player shot volume, zone efficiency and distance across historical seasons.",
};

export default function Page() {
  return <Suspense fallback={<p>Loading shooting profiles…</p>}><NcaaShooting /></Suspense>;
}
