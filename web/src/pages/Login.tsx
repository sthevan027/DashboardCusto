import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { T } from "../lib/db/catalog";

function IconEye({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export function Login() {
  const { session, isAdmin, loading, signIn, signOut } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const from =
    (loc.state as { from?: string } | undefined)?.from ?? "/lancamentos";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!loading && session && isAdmin) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const { error } = await signIn(email, password);
    if (error) {
      setPending(false);
      setErr();
      return;
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      setPending(false);
      setErr();
      await signOut();
      return;
    }
    const { data: prof, error: profErr } = await supabase
      .from(T.app_profiles)
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    setPending(false);
    if (profErr || prof?.role !== "admin") {
      setErr();
      await signOut();
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--app-bg) px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-(--text)">
          Acesso administrativo
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-(--muted)">
          Lançamentos e histórico exigem login. O dashboard público continua em{" "}
          <Link to="/" className="font-medium text-(--accent) hover:underline">
            /
          </Link>{" "}
          e o visualizador em{" "}
          <Link
            to="/visual"
            className="font-medium text-(--accent) hover:underline"
          >
            /visual
          </Link>
          .
        </p>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-8 space-y-4 rounded-xl border border-(--border) bg-(--card) p-6 shadow-(--shadow-card)"
        >
          <label className="block text-xs font-medium text-(--muted)">
            E-mail (pode ser fictício, cadastrado no Supabase Auth)
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text)"
            />
          </label>
          <label className="block text-xs font-medium text-(--muted)">
            Senha
            <div className="relative mt-1.5">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-(--border) bg-(--input-bg) py-2 pl-3 pr-11 text-sm text-(--text)"
              />
              <button
                type="button"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-(--muted) transition hover:bg-(--nav-hover) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/40"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <IconEyeOff className="shrink-0" />
                ) : (
                  <IconEye className="shrink-0" />
                )}
              </button>
            </div>
          </label>
          {err && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-(--accent) px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
