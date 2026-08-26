import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Agenda } from './pages/Agenda';
import { Pacientes } from './pages/Pacientes';
import { PacienteFicha } from './pages/PacienteFicha';
import { Proximamente } from './pages/Proximamente';
import { Presupuestos } from './pages/Presupuestos';
import { Cobros } from './pages/Cobros';

function RutaPrivada({ children }: { children: JSX.Element }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="cargando-pagina">Cargando…</p>;
  if (!usuario) return <Navigate to="/login" replace />;
  return children;
}

const PROXIMAMENTE: Array<{ path: string; titulo: string; descripcion: string }> = [
  { path: '/sillon', titulo: 'Modo sillón', descripcion: 'Semáforo de la clínica, gabinetes en directo y profesionales disponibles.' },
  { path: '/portal', titulo: 'Portal del paciente', descripcion: 'Acceso del paciente a sus tratamientos, pagos y próxima cita.' },
  { path: '/kiosco', titulo: 'Área del paciente', descripcion: 'Autoservicio en sala: confirmar llegada y firmar consentimientos.' },
  { path: '/lab', titulo: 'Laboratorio y placas', descripcion: 'Seguimiento de casos de laboratorio y radiografías.' },
  { path: '/contactos', titulo: 'Contactos', descripcion: 'Médicos y clínicas que derivan pacientes.' },
  { path: '/gestion', titulo: 'Gestión', descripcion: 'Facturación, banco, compras, almacén, equipo y marketing.' },
];

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
        <Route path="/presupuestos" element={<Presupuestos />} />
        <Route path="/cobros" element={<Cobros />} />
        {PROXIMAMENTE.map((p) => (
          <Route key={p.path} path={p.path} element={<Proximamente titulo={p.titulo} descripcion={p.descripcion} />} />
        ))}
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
