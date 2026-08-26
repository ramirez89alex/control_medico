import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Agenda } from './pages/Agenda';
import { Pacientes } from './pages/Pacientes';
import { PacienteFicha } from './pages/PacienteFicha';

function RutaPrivada({ children }: { children: JSX.Element }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="cargando-pagina">Cargando…</p>;
  if (!usuario) return <Navigate to="/login" replace />;
  return children;
}

function Rutas() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RutaPrivada>
            <Layout />
          </RutaPrivada>
        }
      >
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/pacientes" element={<Pacientes />} />
        <Route path="/pacientes/:id" element={<PacienteFicha />} />
        <Route path="/" element={<Navigate to="/agenda" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Rutas />
    </AuthProvider>
  );
}
