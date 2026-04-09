import { NavLink, Outlet } from 'react-router-dom'

const link =
  'rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-soft)]'
const active =
  'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]/30'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="text-left">
            <div className="text-lg font-semibold text-[var(--text)]">
              JL Dashboard de Custos
            </div>
            <div className="text-xs text-[var(--muted)]">
              Orçado vs realizado · contrato
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? `${link} ${active}` : link)}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/visual"
              className={({ isActive }) => (isActive ? `${link} ${active}` : link)}
            >
              Visual (Dados)
            </NavLink>
            <NavLink
              to="/lancamentos"
              className={({ isActive }) => (isActive ? `${link} ${active}` : link)}
            >
              Lançamentos
            </NavLink>
            <NavLink
              to="/historico"
              className={({ isActive }) => (isActive ? `${link} ${active}` : link)}
            >
              Histórico
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 text-left">
        <Outlet />
      </main>
    </div>
  )
}
