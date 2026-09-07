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
