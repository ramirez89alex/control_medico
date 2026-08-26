import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';

export function Login() {
  const { usuario, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/agenda" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="portada" style={{ paddingTop: '8vh' }}>
      <img className="plogo" src="/icon-192.png" alt="PowerDent" />
      <p className="mini">Gestión clínica</p>
      <div className="pcard" style={{ maxWidth: 380, margin: '20px auto 0', cursor: 'default' }}>
        <form onSubmit={onSubmit} style={{ textAlign: 'left' }}>
          <div className="f">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="f">
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && (
            <p className="mini" style={{ color: 'var(--rojo)' }}>
              {error}
            </p>
          )}
          <button className="btn pri" type="submit" style={{ width: '100%' }} disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
