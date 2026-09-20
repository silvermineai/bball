import SportScopeBoundary from "../_components/SportScopeBoundary";

export const metadata = { title: "College basketball intelligence" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SportScopeBoundary sport="basketball">{children}</SportScopeBoundary>;
}
