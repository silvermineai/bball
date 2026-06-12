import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ClipboardList, Database, Film, LogIn, LogOut, Newspaper, Shield, Target, TrendingUp, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const { data } = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, staleTime: 60_000, retry: false });
  const navItems = [
    { to: "/scout", label: "Scout", icon: ClipboardList },
    { to: "/gameplan", label: "Game Plan", icon: Target },
    { to: "/recruiting", label: "Recruiting", icon: UsersRound },
    { to: "/pressroom", label: "Press Room", icon: Newspaper },
    { to: "/film", label: "Film", icon: Film },
    { to: "/rankings", label: "Ratings", icon: TrendingUp },
  ];
  const dataItems = [
    { to: "/teams", label: "Teams" },
    { to: "/games", label: "Games" },
    { to: "/players", label: "Players" },
    ...(data?.user?.isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
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
              <div className="font-stat text-[10px] font-semibold uppercase tracking-[0.22em] text-court">Silvermine</div>
              <div className="font-display text-lg font-semibold leading-tight">The Coaching Annual</div>
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
            <div className="group relative">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-graphite transition hover:bg-white"
              >
                <Database size={15} />
                Data
                <ChevronDown size={13} />
              </button>
              <div className="invisible absolute right-0 z-30 mt-1 w-36 rounded-md border border-line bg-white p-1 opacity-0 shadow-panel transition group-hover:visible group-hover:opacity-100">
                {dataItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-2 rounded px-3 py-2 text-sm text-graphite transition hover:bg-paper hover:text-ink"
                  >
                    {item.label === "Admin" ? <Shield size={13} /> : null}
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>
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
