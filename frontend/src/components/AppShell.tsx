import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, CalendarDays, LogIn, LogOut, Search, Shield, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const { data } = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, staleTime: 60_000 });
  const navItems = [
    { to: "/", label: "Dashboard", icon: Activity },
    { to: "/teams", label: "Teams", icon: UsersRound },
    { to: "/games", label: "Games", icon: CalendarDays },
    { to: "/players", label: "Players", icon: BarChart3 },
    ...(data?.user?.isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  async function signOut() {
    await api.logout();
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-court">Silvermine</div>
              <div className="text-lg font-semibold leading-tight">NCAA Analytics</div>
            </div>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-graphite transition hover:bg-white"
                activeProps={{ className: "bg-white text-ink shadow-sm" }}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden w-64 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 lg:flex">
            <Search size={16} className="text-court" />
            <input className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0" placeholder="Search teams or players" />
          </div>
          {data?.user ? (
            <button
              type="button"
              onClick={signOut}
              className="hidden items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-graphite transition hover:text-ink md:flex"
              title={`Signed in as ${data.user.email}`}
            >
              <LogOut size={15} />
              Sign out
            </button>
          ) : (
            <Link
              to="/login"
              className="hidden items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-graphite transition hover:text-ink md:flex"
            >
              <LogIn size={15} />
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </div>
  );
}
