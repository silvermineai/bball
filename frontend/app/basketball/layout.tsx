import { Suspense } from "react";
import SportScopeBoundary from "../_components/SportScopeBoundary";

export const metadata = { title: "College basketball intelligence" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="scope-loading" aria-busy="true" />}><SportScopeBoundary sport="basketball">{children}</SportScopeBoundary></Suspense>;
}
