import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function IconDashboard({ className }: { className?: string }) {
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
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

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

function IconPenLine({ className }: { className?: string }) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconHistory({ className }: { className?: string }) {
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
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/images.jpg"
      alt=""
      width={40}
      height={40}
      decoding="async"
      className={`h-10 w-10 shrink-0 rounded-xl object-cover ${className ?? ""}`}
    />
  );
}

const navItemBase =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors";
const navInactive =
  "text-(--muted) hover:bg-(--nav-hover) hover:text-(--text)";
const navActive = "bg-(--accent) text-white shadow-sm";

const publicNav: {
  to: string;
  label: string;
  end?: boolean;
  Icon: typeof IconDashboard;
}[] = [
  { to: "/", label: "Dashboard", end: true, Icon: IconDashboard },
  { to: "/visual", label: "Visualizador", Icon: IconEye },
];

const adminNav: {
  to: string;
  label: string;
  Icon: typeof IconPenLine;
}[] = [
  { to: "/lancamentos", label: "Lançamentos", Icon: IconPenLine },
  { to: "/historico", label: "Histórico", Icon: IconHistory },
];

export function Layout() {
  const {
    isAdmin,
    loading,
    session,
    displayName,
    setDisplayName,
    refreshProfile,
  } = useAuth();
  const showAdmin = !loading && isAdmin;
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const adminLabel =
    displayName?.trim() ||
    session?.user?.email?.split("@")[0] ||
    "Administrador";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-(--border) bg-(--card) md:sticky md:top-0 md:h-screen md:w-65 md:border-r md:border-b-0">
        <div className="flex items-start gap-3 border-b border-(--border) px-5 py-5 md:py-6">
          <BrandLogo />
          <div className="min-w-0 text-left">
            <div className="text-base font-semibold leading-tight tracking-tight text-(--text)">
              Controle Operacional
            </div>
            <div className="mt-1 text-xs leading-snug text-(--muted)">
              Dashboard de custos da obra
            </div>
          </div>
        </div>
        <nav
          className="flex flex-row gap-1 overflow-x-auto p-3 md:flex-1 md:flex-col md:overflow-x-visible"
          aria-label="Principal"
        >
          {publicNav.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `${navItemBase} shrink-0 whitespace-nowrap ${isActive ? navActive : navInactive}`
              }
            >
              <Icon className="shrink-0 opacity-90" />
              {label}
            </NavLink>
          ))}
          {showAdmin &&
            adminNav.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `${navItemBase} shrink-0 whitespace-nowrap ${isActive ? navActive : navInactive}`
                }
              >
                <Icon className="shrink-0 opacity-90" />
                {label}
              </NavLink>
            ))}
        </nav>
        <div className="mt-auto border-t border-(--border) p-3">
          {showAdmin ? (
            <div className="rounded-xl border border-(--border) bg-(--app-bg) px-3 py-2.5 text-sm">
              <div className="font-medium text-(--text)">{adminLabel}</div>
              {nameOpen ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="text-[11px] text-(--muted)" htmlFor="admin-display-name">
                    Nome no histórico
                  </label>
                  <input
                    id="admin-display-name"
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Ex.: João Silva"
                    className="w-full rounded-lg border border-(--border) bg-(--card) px-2 py-1.5 text-sm text-(--text)"
                    disabled={nameSaving}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={nameSaving}
                      className="rounded-lg bg-(--accent) px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                      onClick={() => {
                        setNameSaving(true);
                        void setDisplayName(nameDraft)
                          .then(({ error }) => {
                            if (!error) {
                              setNameOpen(false);
                              void refreshProfile();
                            }
                          })
                          .finally(() => setNameSaving(false));
                      }}
                    >
                      {nameSaving ? "A guardar…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-(--border) px-2.5 py-1 text-[11px] text-(--muted)"
                      onClick={() => setNameOpen(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-2 text-left text-xs font-medium text-(--accent) hover:underline"
                  onClick={() => {
                    setNameDraft(displayName ?? "");
                    setNameOpen(true);
                  }}
                >
                  Editar nome
                </button>
              )}
            </div>
          ) : (
            <NavLink
              to="/login"
              className={`${navItemBase} text-(--muted) hover:text-(--text)`}
            >
              Entrar (admin)
            </NavLink>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-(--app-bg)">
        <main className="mx-auto w-full max-w-400 flex-1 px-5 py-8 text-left sm:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
