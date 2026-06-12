import { api } from "@/lib/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { BarChart3, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const auth = useMutation({
    mutationFn: () => (mode === "login" ? api.login({ email, password }) : api.register({ email, password })),
    onSuccess: () => navigate({ to: "/" }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    auth.mutate();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-10 text-ink">
      <section className="w-full max-w-md rounded-md border border-line bg-white p-6 shadow-panel">
        <Link to="/login" className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-ink text-white">
            <BarChart3 size={21} />
          </div>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-court">Silvermine</div>
            <div className="text-lg font-semibold leading-tight">NCAA Analytics</div>
          </div>
        </Link>

        <div className="mt-8">
          <div className="flex items-center gap-2 text-court">
            <LockKeyhole size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">
              {mode === "login" ? "Coach Login" : "Create Account"}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {mode === "login" ? "Sign in to your dashboard." : "Create your coaching workspace."}
          </h1>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="text-sm font-medium text-graphite">Email</span>
            <input
              className="mt-2 w-full rounded-md border-line bg-white"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-graphite">Password</span>
            <input
              className="mt-2 w-full rounded-md border-line bg-white"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {auth.error ? (
            <div className="rounded-md border border-miss/30 bg-miss/10 px-3 py-2 text-sm text-ink">{auth.error.message}</div>
          ) : null}

          <button
            type="submit"
            disabled={auth.isPending}
            className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-60"
          >
            {auth.isPending ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="mt-5 w-full text-center text-sm font-medium text-court hover:text-ink"
          onClick={() => {
            auth.reset();
            setMode((current) => (current === "login" ? "register" : "login"));
          }}
        >
          {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
