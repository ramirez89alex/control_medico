import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiPaciente, refrescarSesionPaciente, salirPaciente } from '../lib/api-paciente';
import { Modal } from '../components/Modal';
import { ConsentimientoDocumento } from '../components/ConsentimientoDocumento';
import type { ClinicaLegal } from '../lib/legal';

interface Dentista {
  nombre: string;
}

interface Cita {
  id: string;
  hora: string;
  motivo: string | null;
  estado: string;
  dentista: Dentista | null;
}

interface LineaPresu {
  id: string;
  nombre: string;
}

interface Presupuesto {
  id: string;
  fecha: string;
  estado: string;
  lineas: LineaPresu[];
}

interface Cobro {
  id: string;
  fecha: string;
  importe: number;
  forma: string;
  concepto: string | null;
}

interface Historia {
  id: string;
  fecha: string;
  acto: string;
  piezas: string | null;
}

interface Consentimiento {
  datos: boolean;
  tratamiento: boolean;
  imagenes: boolean;
  comercial: boolean;
  fecha: string | null;
  firmaUrl: string | null;
}

interface PacientePortal {
  id: string;
  nombre: string;
  apellidos: string;
  dni: string | null;
  nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  alergias: string | null;
  medicacion: string | null;
  antecedentes: string | null;
}

interface DatosPortal {
  paciente: PacientePortal;
  clinica: ClinicaLegal;
  citaHoy: Cita | null;
  proximaCita: { fecha: string; hora: string } | null;
  historia: Historia[];
  presupuestos: Presupuesto[];
  cobros: Cobro[];
  saldo: { facturado: number; pagos: number; pendiente: number };
  consentimiento: Consentimiento;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

const FORMAS: Record<string, string> = {
  tarjeta: 'Tarjeta',
  efectivo: 'Efectivo',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  enlace_pago: 'Enlace de pago',
  financiacion: 'Financiación',
  seguro: 'Seguro',
};

const LLEGADO = ['llegado', 'silla', 'hecha'];

export function MiPortal() {
  const [datos, setDatos] = useState<DatosPortal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [viendoConsentimiento, setViendoConsentimiento] = useState(false);

  async function cargar() {
    try {
      const d = await apiPaciente.get<DatosPortal>('/portal/mi');
      setDatos(d);
    } catch {
      setError('Tu sesión ha caducado. Pide un enlace nuevo en recepción.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    (async () => {
      const sesion = await refrescarSesionPaciente();
      if (!sesion) {
        setError('Tu sesión ha caducado. Pide un enlace nuevo en recepción.');
        setCargando(false);
        return;
      }
      cargar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkin() {
    await apiPaciente.post('/portal/checkin');
    cargar();
  }

  if (cargando) return <p className="mini" style={{ textAlign: 'center', marginTop: '20vh' }}>Cargando…</p>;
  if (error || !datos)
    return (
      <div className="portada" style={{ paddingTop: '15vh' }}>
        <p className="mini">{error}</p>
      </div>
    );

  const { paciente, clinica, citaHoy, proximaCita, historia, presupuestos, cobros, saldo, consentimiento } = datos;
  const llegado = citaHoy && LLEGADO.includes(citaHoy.estado);

  return (
    <div className="kiosco ancho" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <div className="entre">
        <div>
          <h2>Hola, {paciente.nombre}</h2>
        </div>
        <button className="btn gh" onClick={() => salirPaciente().then(() => location.reload())}>
          Salir
        </button>
      </div>

      {citaHoy ? (
        <div className={`kcheck ${llegado ? 'ok' : ''}`}>
          <div>
            <small>TU CITA DE HOY</small>
            <b>
              {citaHoy.hora} · {citaHoy.motivo || 'Consulta'}
            </b>
            <div className="mini">{citaHoy.dentista?.nombre || ''}</div>
          </div>
          {llegado ? (
            <div className="kconf">
              <span className="tick">✓</span>
              <div>
                <b>Confirmado</b>
                <div className="mini">Llegada registrada. Toma asiento, te avisamos.</div>
              </div>
            </div>
          ) : (
            <button className="btn pri grande" onClick={checkin}>
              He llegado a la clínica
            </button>
          )}
        </div>
      ) : (
        <div className="kcheck">
          <div>
            <small>HOY</small>
            <b>No tienes cita para hoy</b>
            {proximaCita && (
              <div className="mini">
                Tu próxima cita: {new Date(`${proximaCita.fecha}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las{' '}
                {proximaCita.hora}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Tu carpeta</h3>
          <hr />
          <div className="pgrid">
            <div className="pbox">
              <small>TRATAMIENTO</small>
              <b>{eur(saldo.facturado)}</b>
            </div>
            <div className="pbox">
              <small>PAGADO</small>
              <b>{eur(saldo.pagos)}</b>
            </div>
            <div className={`pbox ${saldo.pendiente > 0.5 ? 'deuda' : ''}`}>
              <small>PENDIENTE</small>
              <b>{eur(saldo.pendiente)}</b>
            </div>
          </div>
          <b className="mini" style={{ display: 'block', marginTop: 14 }}>
            TRATAMIENTOS REALIZADOS
          </b>
          {historia.length ? (
            <table>
              <tbody>
                {historia.map((h) => (
                  <tr key={h.id}>
                    <td className="mini" style={{ width: 96 }}>
                      {new Date(h.fecha).toLocaleDateString('es-ES')}
                    </td>
                    <td>
                      {h.acto}
                      {h.piezas && (
                        <span className="tag info" style={{ marginLeft: 6 }}>
                          pieza {h.piezas}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="vacio">Todavía no hay tratamientos.</div>
          )}
        </div>

        <div className="card">
          <h3>Documentos</h3>
          <hr />
          <b className="mini">PRESUPUESTOS</b>
          {presupuestos.length ? (
            <table>
              <tbody>
                {presupuestos.map((p) => (
                  <tr key={p.id}>
                    <td className="mini" style={{ width: 96 }}>
                      {new Date(p.fecha).toLocaleDateString('es-ES')}
                    </td>
                    <td>
                      {p.lineas.map((l) => l.nombre).join(', ').slice(0, 60)}
                      <div className="mini">{p.estado}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="vacio">Sin presupuestos.</div>
          )}
          <hr />
          <b className="mini">PAGOS</b>
          {cobros.length ? (
            <table>
              <tbody>
                {cobros.map((c) => (
                  <tr key={c.id}>
                    <td className="mini" style={{ width: 96 }}>
                      {new Date(c.fecha).toLocaleDateString('es-ES')}
                    </td>
                    <td>
                      {c.concepto || 'Pago'}
                      <div className="mini">{FORMAS[c.forma] || c.forma}</div>
                    </td>
                    <td className="num">{eur(c.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="vacio">Sin pagos registrados.</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Consentimiento y protección de datos</h3>
        <hr />
        {consentimiento.firmaUrl ? (
          <>
            <div className="fila" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span className={`tag ${consentimiento.datos ? 'ok' : 'bad'}`}>Tratamiento de datos {consentimiento.datos ? 'aceptado' : 'sin aceptar'}</span>
              <span className={`tag ${consentimiento.tratamiento ? 'ok' : 'bad'}`}>Tratamiento clínico {consentimiento.tratamiento ? 'aceptado' : 'sin aceptar'}</span>
              <span className={`tag ${consentimiento.imagenes ? 'ok' : ''}`}>Imágenes clínicas {consentimiento.imagenes ? 'autorizadas' : 'no autorizadas'}</span>
              <span className={`tag ${consentimiento.comercial ? 'ok' : ''}`}>Comunicaciones {consentimiento.comercial ? 'autorizadas' : 'no autorizadas'}</span>
            </div>
            {consentimiento.fecha && (
              <p className="mini" style={{ marginTop: 8 }}>
                Firmado el {new Date(consentimiento.fecha).toLocaleDateString('es-ES')}
              </p>
            )}
            <img
              src={consentimiento.firmaUrl}
              alt="Firma del consentimiento"
              style={{ border: '1px solid var(--linea)', borderRadius: 8, background: '#fff', maxWidth: '100%', height: 110, objectFit: 'contain', marginTop: 8 }}
            />
            <button className="btn gh" style={{ marginTop: 10 }} onClick={() => setViendoConsentimiento(true)}>
              Ver consentimiento firmado
            </button>
          </>
        ) : (
          <div className="vacio">Todavía no hay un consentimiento firmado. Pídelo en recepción en tu próxima visita.</div>
        )}
      </div>

      {viendoConsentimiento && (
        <Modal onClose={() => setViendoConsentimiento(false)} ancho={720}>
          <ConsentimientoDocumento clinica={clinica} paciente={paciente} consentimiento={consentimiento} />
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn gh" onClick={() => setViendoConsentimiento(false)}>
              Cerrar
            </button>
            <button className="btn pri" onClick={() => window.print()}>
              Imprimir / Guardar PDF
            </button>
          </div>
        </Modal>
      )}

      {viendoConsentimiento &&
        createPortal(
          <div id="print">
            <ConsentimientoDocumento clinica={clinica} paciente={paciente} consentimiento={consentimiento} />
          </div>,
          document.body,
        )}
    </div>
  );
}
