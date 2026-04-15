import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isAdmin, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="rounded-xl border border-(--border) bg-(--card) px-5 py-10 text-sm text-(--muted) shadow-(--shadow-card)">
        Carregando…
      </div>
    );
  }
  if (!session || !isAdmin) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
