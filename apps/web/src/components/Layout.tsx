import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

const MENU: Array<{ sep: string } | { to: string; label: string }> = [
  { sep: 'Clínica' },
  { to: '/sillon', label: 'Modo sillón' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/presupuestos', label: 'Presupuestos' },
  { to: '/cobros', label: 'Cobros' },
  { sep: 'Paciente' },
  { to: '/portal', label: 'Portal del paciente' },
  { to: '/lab', label: 'Laboratorio y placas' },
  { to: '/contactos', label: 'Contactos' },
  { sep: 'Reservado' },
  { to: '/equipo', label: 'Equipo' },
  { to: '/ajustes', label: 'Ajustes' },
  { to: '/gestion', label: 'Gestión 🔒' },
];

function horaActual() {
  return new Date().toTimeString().slice(0, 5);
}

function diaActual() {
  return new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function Layout() {
  const { usuario, logout } = useAuth();
  const [hora, setHora] = useState(horaActual());

  useEffect(() => {
    const id = setInterval(() => setHora(horaActual()), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <img className="mark" src="/icon-192.png" alt="PowerDent" />
          <div className="bnom">
            <b>PowerDent</b>
            <small>Marratxí</small>
          </div>
        </div>
        <nav>
          {MENU.map((item) =>
            'sep' in item ? (
              <div className="sep" key={item.sep}>
                {item.sep}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'on' : '')}>
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
      </aside>
      <main>
        <Outlet />
      </main>
      <footer id="pie">
        <div className="pizq">
          <span className="pluz on" />
          <b>{hora}</b>
          <span id="piedia">{diaActual()}</span>
        </div>
        <div className="pder">
          <span className="mini">{usuario?.nombre}</span>
          <button className="pbtn dir" onClick={() => logout()}>
            Salir
          </button>
        </div>
      </footer>
    </div>
  );
}
