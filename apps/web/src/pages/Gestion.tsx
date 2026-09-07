import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useGestion } from '../lib/gestion-context';
import { GestionGate } from '../components/GestionGate';

const SECCIONES: Array<{ to: string; titulo: string; descripcion: string; disponible: boolean }> = [
  { to: '/gestion/ajustes', titulo: 'Ajustes', descripcion: 'Datos de la clínica, financiación, gabinetes y tarifario.', disponible: true },
  { to: '/gestion/facturacion', titulo: 'Facturación', descripcion: 'Facturas propias con serie y numeración correlativa desde tus cobros.', disponible: true },
  { to: '/gestion/banco', titulo: 'Banco', descripcion: 'Pegar extracto y conciliar contra facturas, cobros y pedidos.', disponible: true },
  { to: '/gestion/compras', titulo: 'Compras', descripcion: 'Proveedores, pedidos en tránsito, albaranes y facturas.', disponible: true },
  { to: '/gestion/almacen', titulo: 'Almacén', descripcion: 'Conteo por departamentos, stock de seguridad y pedido automático.', disponible: true },
  { to: '/gestion/marketing', titulo: 'Marketing', descripcion: 'Cumpleaños, revisiones pendientes, campañas e ideas.', disponible: true },
];

function CambiarCodigo() {
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setOk(false);
    try {
      await api.put('/gestion/codigo', { codigoActual: actual, codigoNuevo: nuevo });
      setOk(true);
      setActual('');
      setNuevo('');
      setAbierto(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el código');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="card">
      <div className="entre">
        <h3>Código de administración</h3>
        {!abierto && (
          <button className="btn gh sm" onClick={() => setAbierto(true)}>
            Cambiar código
          </button>
        )}
      </div>
      <hr />
      <p className="mini">Protege la edición de Ajustes y el resto de Gestión. Cada clínica tiene el suyo propio.</p>
      {ok && <p className="mini" style={{ color: 'var(--verde, #1a7f4e)' }}>Código actualizado.</p>}
      {abierto && (
        <form onSubmit={guardar}>
          <div className="grid g2" style={{ marginTop: 10 }}>
            <div className="f">
              <label>Código actual</label>
              <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} />
            </div>
            <div className="f">
              <label>Código nuevo</label>
              <input type="password" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
            </div>
          </div>
          {error && (
            <p className="mini" style={{ color: 'var(--rojo)' }}>
              {error}
            </p>
          )}
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" className="btn gh" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
            <button className="btn pri" disabled={cargando || nuevo.length < 4}>
              {cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const RESET_CONFIRMACION = 'BORRAR TODO';

function ResetDatos() {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function confirmar() {
    setCargando(true);
    setError(null);
    try {
      await api.post('/gestion/reset-datos-clinicos', { confirmacion: texto });
      navigate('/agenda');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo vaciar la clínica');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--rojo)' }}>
      <div className="entre">
        <h3 style={{ color: 'var(--rojo)' }}>Vaciar datos de ejemplo</h3>
        {!abierto && (
          <button className="btn gh sm" onClick={() => setAbierto(true)}>
            Empezar de cero
          </button>
        )}
      </div>
      <hr />
      <p className="mini">
        Borra permanentemente pacientes, citas, historia clínica, presupuestos, cobros, facturas, laboratorio, banco, compras/almacén,
        campañas e ideas — pensado para quitar los datos de prueba antes de usar la clínica de verdad. <b>No se puede deshacer.</b>
      </p>
      <p className="mini">Se mantienen: datos de la clínica, tarifario, gabinetes, equipo, usuarios de acceso y el código de Gestión.</p>
      {abierto && (
        <>
          <div className="f" style={{ marginTop: 10 }}>
            <label>Escribe "{RESET_CONFIRMACION}" para confirmar</label>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={RESET_CONFIRMACION} />
          </div>
          {error && (
            <p className="mini" style={{ color: 'var(--rojo)' }}>
              {error}
            </p>
          )}
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              className="btn gh"
              onClick={() => {
                setAbierto(false);
                setTexto('');
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button className="btn dan" disabled={cargando || texto !== RESET_CONFIRMACION} onClick={confirmar}>
              {cargando ? 'Vaciando…' : 'Vaciar clínica'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function GestionContenido() {
  const { usuario } = useAuth();
  const { bloquear } = useGestion();
  const navigate = useNavigate();

  function bloquearYSalir() {
    bloquear();
    navigate('/agenda');
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Gestión</h1>
          <p>Zona de administración · desbloqueada</p>
        </div>
        <div className="acciones">
          <button className="btn gh" onClick={bloquearYSalir}>
            Bloquear y salir
          </button>
        </div>
      </div>

      <div className="grid g2">
        {SECCIONES.map((s) =>
          s.disponible ? (
            <Link key={s.to} to={s.to} className="card gsec" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <h3>{s.titulo}</h3>
              <p className="mini">{s.descripcion}</p>
            </Link>
          ) : (
            <div key={s.to} className="card gsec" style={{ opacity: 0.55 }}>
              <div className="entre">
                <h3>{s.titulo}</h3>
                <span className="tag">Próximamente</span>
              </div>
              <p className="mini">{s.descripcion}</p>
            </div>
          ),
        )}
      </div>

      {usuario?.rol === 'admin' && <CambiarCodigo />}
      {usuario?.rol === 'admin' && <ResetDatos />}
    </div>
  );
}

export function Gestion() {
  return (
    <GestionGate>
      <GestionContenido />
    </GestionGate>
  );
}
