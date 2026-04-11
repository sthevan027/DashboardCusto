import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Historico } from "./pages/Historico";
import { Lancamentos } from "./pages/Lancamentos";
import { Visual } from "./pages/Visualizador";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="visual" element={<Visual />} />
          <Route path="lancamentos" element={<Lancamentos />} />
          <Route path="historico" element={< Historico />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
