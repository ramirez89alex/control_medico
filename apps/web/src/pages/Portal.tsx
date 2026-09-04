import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
}

export function Portal() {
  const [q, setQ] = useState('');
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [enlace, setEnlace] = useState<{ paciente: Paciente; url: string } | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enlace) {
      setQrUrl(null);
      return;
    }
    QRCode.toDataURL(enlace.url, { margin: 1, width: 220 })
      .then(setQrUrl)
      .catch(() => setQrUrl(null));
  }, [enlace]);

  async function buscar() {
    setPacientes(await api.get<Paciente[]>(`/pacientes?q=${encodeURIComponent(q)}`));
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function generar(p: Paciente) {
    setGenerando(p.id);
    setCopiado(false);
    try {
      const { url } = await api.post<{ url: string }>('/auth/paciente/generar', { pacienteId: p.id });
      setEnlace({ paciente: p, url });
    } finally {
      setGenerando(null);
    }
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      // portapapeles no disponible: el enlace sigue visible para copiarlo a mano
    }
  }

  function telWA(tel: string) {
    const limpio = tel.replace(/[^\d]/g, '');
    return limpio.length === 9 ? `34${limpio}` : limpio;
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Portal del paciente</h1>
          <p>Genera un enlace de acceso de un solo uso para que el paciente entre a su área</p>
        </div>
        <div className="acciones">
          <input placeholder="Buscar paciente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card">
        {pacientes.length === 0 ? (
          <div className="vacio">Sin pacientes.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>
                      {p.nombre} {p.apellidos}
                    </b>
                  </td>
                  <td className="mini">{p.telefono || '—'}</td>
                  <td className="num">
                    <button className="btn pri sm" disabled={generando === p.id} onClick={() => generar(p)}>
                      {generando === p.id ? 'Generando…' : 'Generar acceso'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {enlace && (
        <Modal onClose={() => setEnlace(null)}>
          <h2>
            Acceso de {enlace.paciente.nombre} {enlace.paciente.apellidos}
          </h2>
          <p className="mini" style={{ marginTop: 8 }}>
            Válido durante 15 minutos y de un solo uso. Que lo escanee con su móvil ahí mismo, o cópialo/envíalo por WhatsApp.
          </p>
          {qrUrl && (
            <div style={{ textAlign: 'center', margin: '14px 0' }}>
              <img src={qrUrl} alt="Código QR de acceso" width={180} height={180} style={{ border: '1px solid var(--linea)', borderRadius: 8 }} />
            </div>
          )}
          <div className="f" style={{ marginTop: 10 }}>
            <input readOnly value={enlace.url} onFocus={(e) => e.target.select()} />
          </div>
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn gh" onClick={() => copiar(enlace.url)}>
              {copiado ? 'Copiado ✓' : 'Copiar enlace'}
            </button>
            {enlace.paciente.telefono && (
              <a
                className="btn pri"
                style={{ textDecoration: 'none' }}
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${telWA(enlace.paciente.telefono)}?text=${encodeURIComponent(
                  `Hola ${enlace.paciente.nombre}, aquí tienes tu acceso al área de paciente: ${enlace.url}`,
                )}`}
              >
                Enviar por WhatsApp
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
