import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { entrarConToken } from '../lib/api-paciente';
import { ApiError } from '../lib/api';

export function AccesoPaciente() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    entrarConToken(token)
      .then(() => navigate('/mi', { replace: true }))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo validar el enlace'));
  }, [token, navigate]);

  return (
    <div className="portada" style={{ paddingTop: '15vh' }}>
      <img className="plogo" src="/icon-192.png" alt="PowerDent" />
      {error ? (
        <div className="pcard" style={{ maxWidth: 420, margin: '20px auto 0', cursor: 'default' }}>
          <h3>Enlace no válido</h3>
          <p className="mini">{error}</p>
          <p className="mini">Pide un enlace nuevo en recepción.</p>
        </div>
      ) : (
        <p className="mini">Entrando…</p>
      )}
    </div>
  );
}
