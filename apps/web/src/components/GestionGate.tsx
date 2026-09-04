import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useGestion } from '../lib/gestion-context';

type Estado = 'cargando' | 'sin_configurar' | 'bloqueado';

export function GestionGate({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const { desbloqueado, desbloquear, marcarDesbloqueado } = useGestion();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [codigo, setCodigo] = useState('');
  const [codigoNuevo, setCodigoNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (desbloqueado) return;
    api.get<{ configurado: boolean }>('/gestion/estado').then((r) => setEstado(r.configurado ? 'bloqueado' : 'sin_configurar'));
  }, [desbloqueado]);

  if (desbloqueado) return <>{children}</>;

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const err = await desbloquear(codigo);
    setCargando(false);
    if (err) {
      setError(err);
      setCodigo('');
    }
  }

  async function configurarCodigo(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const { token } = await api.put<{ token: string }>('/gestion/codigo', { codigoNuevo });
      marcarDesbloqueado(token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo configurar el código');
    } finally {
      setCargando(false);
    }
  }

  if (estado === 'cargando') return <p className="mini">Cargando…</p>;

  if (estado === 'sin_configurar') {
    if (usuario?.rol !== 'admin') {
      return (
        <div className="card" style={{ maxWidth: 420, margin: '10vh auto', textAlign: 'center' }}>
          <h2>🔒 Gestión</h2>
          <p className="mini">Todavía no hay un código de administración configurado. Pide a un administrador que entre y lo configure.</p>
        </div>
      );
    }
    return (
      <div className="card" style={{ maxWidth: 360, margin: '10vh auto', textAlign: 'center' }}>
        <h2>🔒 Configura Gestión</h2>
        <p className="mini">Es el primer acceso: crea el código de administración de esta clínica. Lo pedirá cualquiera que quiera entrar aquí.</p>
        <form onSubmit={configurarCodigo}>
          <div className="f" style={{ marginTop: 14 }}>
            <label>Código nuevo</label>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={codigoNuevo}
              onChange={(e) => setCodigoNuevo(e.target.value)}
              style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center', fontFamily: "'IBM Plex Mono'" }}
            />
          </div>
          {error && (
            <p className="mini" style={{ color: 'var(--rojo)' }}>
              {error}
            </p>
          )}
          <button className="btn pri" style={{ marginTop: 10 }} disabled={cargando || codigoNuevo.length < 4}>
            {cargando ? 'Guardando…' : 'Crear código y entrar'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 360, margin: '10vh auto', textAlign: 'center' }}>
      <h2>🔒 Gestión bloqueada</h2>
      <p className="mini">Introduce el código de administración para continuar.</p>
      <form onSubmit={enviarCodigo}>
        <div className="f" style={{ marginTop: 14 }}>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            style={{ fontSize: 22, letterSpacing: '.4em', textAlign: 'center', fontFamily: "'IBM Plex Mono'" }}
          />
        </div>
        {error && (
          <p className="mini" style={{ color: 'var(--rojo)' }}>
            {error}
          </p>
        )}
        <button className="btn pri" style={{ marginTop: 10 }} disabled={cargando || !codigo}>
          {cargando ? 'Comprobando…' : 'Desbloquear'}
        </button>
      </form>
    </div>
  );
}
