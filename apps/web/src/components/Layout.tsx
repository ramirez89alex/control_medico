import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

const MENU = [
  { to: '/agenda', label: 'Agenda' },
  { to: '/pacientes', label: 'Pacientes' },
];

export function Layout() {
  const { usuario, logout } = useAuth();
  return (
    <div className="layout">
      <nav className="nav">
        <div className="marca">PowerDent</div>
        {MENU.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link on' : 'nav-link')}>
            {item.label}
          </NavLink>
        ))}
        <div className="nav-usuario">
          <span>{usuario?.nombre}</span>
          <button className="btn gh sm" onClick={() => logout()}>
            Salir
          </button>
        </div>
      </nav>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
