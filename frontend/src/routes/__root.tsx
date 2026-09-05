/// <reference types="vite/client" />

import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import "../styles.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Silvermine NCAA Analytics" },
      {
        name: "description",
        content: "Coach-first NCAA analytics with game, team, player, and event data.",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const app = (
    <QueryClientProvider client={queryClient}>
      <AuthenticatedApp />
    </QueryClientProvider>
  );

  if (typeof document !== "undefined") {
    return app;
  }

  return <RootDocument>{app}</RootDocument>;
}

function AuthenticatedApp() {
  const isLoginRoute = typeof window !== "undefined" && window.location.pathname === "/basketball/login";

  return isLoginRoute ? (
    <Outlet />
  ) : (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
