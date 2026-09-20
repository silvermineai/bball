import { Suspense } from "react";
import SportScopeBoundary from "../_components/SportScopeBoundary";

export const metadata = { title: "College football intelligence" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="scope-loading" aria-busy="true" />}><SportScopeBoundary sport="football">{children}</SportScopeBoundary></Suspense>;
}
