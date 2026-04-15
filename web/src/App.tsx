import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Dashboard } from "./pages/Dashboard";
import { Historico } from "./pages/Historico";
import { Lancamentos } from "./pages/Lancamentos";
import { Login } from "./pages/Login";
import { Visual } from "./pages/Visualizador";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="visual" element={<Visual />} />
        <Route
          path="lancamentos"
          element={
            <ProtectedRoute>
              <Lancamentos />
            </ProtectedRoute>
          }
        />
        <Route
          path="historico"
          element={
            <ProtectedRoute>
              <Historico />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
