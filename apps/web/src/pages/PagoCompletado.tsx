import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_URL } from '../lib/api';

interface EstadoPago {
  estado: 'pendiente' | 'pagado' | 'expirado' | 'cancelado';
  importe: number;
  concepto: string | null;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function PagoCompletado() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [estado, setEstado] = useState<EstadoPago | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('Enlace incompleto.');
      return;
    }
    let intentos = 0;
    // Stripe redirige aquí en cuanto el navegador confirma el pago, pero el webhook (que es
    // quien de verdad marca el enlace como pagado) puede tardar un par de segundos más — se
    // reintenta unas cuantas veces en vez de mostrar "pendiente" y quedarse así.
    function consultar() {
      fetch(`${API_URL}/pagos/publico/${sessionId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: EstadoPago) => {
          setEstado(d);
          if (d.estado === 'pendiente' && intentos < 6) {
            intentos += 1;
            setTimeout(consultar, 2000);
          }
        })
        .catch(() => setError('No se pudo comprobar el pago.'));
    }
    consultar();
  }, [sessionId]);

  return (
    <div className="portada" style={{ paddingTop: '15vh' }}>
      <img className="plogo" src="/icon-192.png" alt="PowerDent" />
      <div className="pcard" style={{ maxWidth: 420, margin: '20px auto 0', cursor: 'default', textAlign: 'center' }}>
        {error ? (
          <>
            <h3>Algo no ha ido bien</h3>
            <p className="mini">{error}</p>
          </>
        ) : !estado ? (
          <p className="mini">Comprobando el pago…</p>
        ) : estado.estado === 'pagado' ? (
          <>
            <h3>✅ Pago recibido</h3>
            <p className="mini">
              {eur(estado.importe)}
              {estado.concepto ? ` · ${estado.concepto}` : ''}
            </p>
            <p className="mini">Gracias, ya está todo registrado.</p>
          </>
        ) : (
          <>
            <h3>Estamos confirmando tu pago</h3>
            <p className="mini">Puede tardar unos segundos. Si tarda mucho, contacta con la clínica para confirmarlo.</p>
          </>
        )}
      </div>
    </div>
  );
}
