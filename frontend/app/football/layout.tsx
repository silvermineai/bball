import SportScopeBoundary from "../_components/SportScopeBoundary";

export const metadata = { title: "College football intelligence" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SportScopeBoundary sport="football">{children}</SportScopeBoundary>;
}
