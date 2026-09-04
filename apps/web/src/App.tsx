import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { GestionProvider } from './lib/gestion-context';
import { GestionGate } from './components/GestionGate';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Agenda } from './pages/Agenda';
import { Pacientes } from './pages/Pacientes';
import { PacienteFicha } from './pages/PacienteFicha';
import { Presupuestos } from './pages/Presupuestos';
import { Cobros } from './pages/Cobros';
import { Sillon } from './pages/Sillon';
import { Laboratorio } from './pages/Laboratorio';
import { Contactos } from './pages/Contactos';
import { Portal } from './pages/Portal';
import { AccesoPaciente } from './pages/AccesoPaciente';
import { MiPortal } from './pages/MiPortal';
import { Equipo } from './pages/Equipo';
import { Gestion } from './pages/Gestion';
import { Ajustes } from './pages/Ajustes';

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
      <Route path="/acceso/:token" element={<AccesoPaciente />} />
      <Route path="/mi" element={<MiPortal />} />
      <Route
        element={
          <RutaPrivada>
            <GestionProvider>
              <Layout />
            </GestionProvider>
          </RutaPrivada>
        }
      >
        <Route path="/sillon" element={<Sillon />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/pacientes" element={<Pacientes />} />
        <Route path="/pacientes/:id" element={<PacienteFicha />} />
        <Route path="/presupuestos" element={<Presupuestos />} />
        <Route path="/cobros" element={<Cobros />} />
        <Route path="/lab" element={<Laboratorio />} />
        <Route path="/contactos" element={<Contactos />} />
        <Route path="/portal" element={<Portal />} />
        <Route path="/equipo" element={<Equipo />} />
        <Route path="/gestion" element={<Gestion />} />
        <Route
          path="/gestion/ajustes"
          element={
            <GestionGate>
              <Ajustes />
            </GestionGate>
          }
        />
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
