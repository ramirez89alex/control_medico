import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/Modal';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
}

interface Cobro {
  id: string;
  fecha: string;
  importe: number;
  forma: string;
  concepto: string | null;
  paciente: Paciente;
}

interface Saldo {
  paciente: Paciente;
  pendiente: number;
}

interface EnlacePago {
  id: string;
  importe: number;
  concepto: string | null;
  estado: 'pendiente' | 'pagado' | 'expirado' | 'cancelado';
  origen: 'personal' | 'paciente';
  stripeUrl: string;
  createdAt: string;
  paciente: Paciente;
}

const ETIQUETA_ESTADO_ENLACE: Record<EnlacePago['estado'], string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
};

function telWA(tel: string) {
  const limpio = tel.replace(/[^\d]/g, '');
  return limpio.length === 9 ? `34${limpio}` : limpio;
}

const FORMAS: Array<{ value: string; label: string }> = [
  { value: 'tarjeta', label: 'Tarjeta (TPV)' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'enlace_pago', label: 'Enlace de pago' },
  { value: 'financiacion', label: 'Financiación' },
  { value: 'seguro', label: 'Seguro' },
];

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function Cobros() {
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [enlaces, setEnlaces] = useState<EnlacePago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState<{ pacienteId?: string } | null>(null);
  const [modalEnlace, setModalEnlace] = useState<{ pacienteId?: string } | null>(null);
  const [generandoEnlace, setGenerandoEnlace] = useState(false);

  async function cargar() {
    setCargando(true);
    const [c, s] = await Promise.all([api.get<Cobro[]>('/cobros'), api.get<Saldo[]>('/cobros/saldos')]);
    setCobros(c);
    setSaldos(s);
    setCargando(false);
  }

  async function cargarEnlaces() {
    setEnlaces(await api.get<EnlacePago[]>('/pagos/enlaces'));
  }

  useEffect(() => {
    cargar();
    cargarEnlaces();
    api.get<Paciente[]>('/pacientes').then(setPacientes);
  }, []);

  const mes = hoyISO().slice(0, 7);
  const cobradoMes = cobros.filter((c) => c.fecha.slice(0, 7) === mes).reduce((a, c) => a + c.importe, 0);
  const pendienteTotal = saldos.reduce((a, s) => a + s.pendiente, 0);

  async function registrarCobro(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post('/cobros', {
      pacienteId: form.get('pacienteId'),
      // 'YYYY-MM-DD' a secas se interpreta como medianoche UTC y puede mostrar el día
      // anterior en la zona horaria del navegador; se fuerza a medianoche local.
      fecha: new Date(`${String(form.get('fecha'))}T00:00:00`).toISOString(),
      importe: Number(form.get('importe')),
      tipo: form.get('tipo'),
      forma: form.get('forma'),
      concepto: form.get('concepto') || undefined,
    });
    setModalAbierto(null);
    cargar();
  }

  const pacientePreseleccionado = modalAbierto?.pacienteId ? pacientes.find((p) => p.id === modalAbierto.pacienteId) : undefined;
  const pendientePreseleccionado = modalAbierto?.pacienteId ? saldos.find((s) => s.paciente.id === modalAbierto.pacienteId)?.pendiente || 0 : 0;

  function enviarPorWhatsApp(enlace: EnlacePago, ventana: Window | null) {
    const texto = `Hola ${enlace.paciente.nombre}, te escribimos de PowerDent.\n\nAquí tienes el enlace para pagar online${enlace.concepto ? ` (${enlace.concepto})` : ''}, ${eur(enlace.importe)}:\n${enlace.stripeUrl}\n\n¡Gracias!`;
    const urlWA = `https://wa.me/${telWA(enlace.paciente.telefono || '')}?text=${encodeURIComponent(texto)}`;
    if (ventana) ventana.location.href = urlWA;
    else window.open(urlWA, '_blank');
  }

  async function generarEnlace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pacienteId = String(form.get('pacienteId'));
    const paciente = pacientes.find((p) => p.id === pacienteId);
    const conTelefono = !!paciente?.telefono;
    // Igual que en los recordatorios de Agenda: se abre la pestaña dentro del clic (si no el
    // navegador la bloquea) y se rellena en cuanto Stripe nos da el enlace real.
    const ventana = conTelefono ? window.open('', '_blank') : null;
    setGenerandoEnlace(true);
    try {
      const enlace = await api.post<EnlacePago>('/pagos/enlace', {
        pacienteId,
        importe: Number(form.get('importe')),
        concepto: form.get('concepto') || undefined,
      });
      setModalEnlace(null);
      cargarEnlaces();
      if (conTelefono) enviarPorWhatsApp(enlace, ventana);
      else window.alert('Enlace generado. Este paciente no tiene teléfono guardado — cópialo desde la lista de enlaces.');
    } catch (err) {
      ventana?.close();
      window.alert(err instanceof ApiError ? err.message : 'No se pudo generar el enlace de pago');
    } finally {
      setGenerandoEnlace(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Cobros y facturas</h1>
          <p>Control de caja y saldos por paciente</p>
        </div>
        <div className="acciones">
          <button className="btn gh" onClick={() => setModalEnlace({})}>
            Enlace de pago
          </button>
          <button className="btn pri" onClick={() => setModalAbierto({})}>
            Registrar cobro
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Cobrado este mes</span>
          <b>{eur(cobradoMes)}</b>
        </div>
        <div className="kpi">
          <span>Pendiente total</span>
          <b style={{ color: 'var(--rojo)' }}>{eur(pendienteTotal)}</b>
        </div>
        <div className="kpi">
          <span>Pacientes con saldo</span>
          <b>{saldos.length}</b>
        </div>
        <div className="kpi">
          <span>Cobros registrados</span>
          <b>{cobros.length}</b>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Movimientos</h3>
          <hr />
          {cargando ? (
            <p className="vacio">Cargando…</p>
          ) : cobros.length === 0 ? (
            <div className="vacio">Sin movimientos.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Forma</th>
                  <th className="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.fecha).toLocaleDateString('es-ES')}</td>
                    <td>
                      {c.paciente.nombre} {c.paciente.apellidos}
                      <div className="mini">{c.concepto || ''}</div>
                    </td>
                    <td>
                      <span className="tag">{FORMAS.find((f) => f.value === c.forma)?.label || c.forma}</span>
                    </td>
                    <td className="num">{eur(c.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Saldos pendientes</h3>
          <hr />
          {saldos.length === 0 ? (
            <div className="vacio">Todo cobrado.</div>
          ) : (
            <table>
              <tbody>
                {saldos.map((s) => (
                  <tr className="click" key={s.paciente.id}>
                    <td>
                      <Link to={`/pacientes/${s.paciente.id}`} style={{ color: 'var(--grafito)', textDecoration: 'none', fontWeight: 600 }}>
                        {s.paciente.nombre} {s.paciente.apellidos}
                      </Link>
                    </td>
                    <td className="mini">{s.paciente.telefono || ''}</td>
                    <td className="num" style={{ color: 'var(--rojo)' }}>
                      {eur(s.pendiente)}
                    </td>
                    <td className="num">
                      <button className="btn gh sm" onClick={() => setModalAbierto({ pacienteId: s.paciente.id })}>
                        Cobrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {enlaces.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Enlaces de pago</h3>
          <p className="mini">Se cobran solos en cuanto el paciente paga — el pago aparece aquí y en Movimientos automáticamente.</p>
          <hr />
          <table>
            <tbody>
              {enlaces.map((en) => (
                <tr key={en.id}>
                  <td className="mono" style={{ width: 96 }}>
                    {new Date(en.createdAt).toLocaleDateString('es-ES')}
                  </td>
                  <td>
                    <b>
                      {en.paciente.nombre} {en.paciente.apellidos}
                    </b>
                    <div className="mini">
                      {en.concepto || ''}
                      {en.origen === 'paciente' && (
                        <span className="tag info" style={{ marginLeft: 6 }}>
                          Iniciado por el paciente
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="num">{eur(en.importe)}</td>
                  <td style={{ width: 110 }}>
                    <span className={`tag ${en.estado === 'pagado' ? 'ok' : en.estado === 'pendiente' ? 'warn' : 'bad'}`}>{ETIQUETA_ESTADO_ENLACE[en.estado]}</span>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {en.estado === 'pendiente' && (
                      <>
                        <button className="btn gh sm" onClick={() => navigator.clipboard?.writeText(en.stripeUrl)}>
                          Copiar
                        </button>{' '}
                        {en.paciente.telefono && (
                          <button className="btn pri sm" onClick={() => enviarPorWhatsApp(en, null)}>
                            WhatsApp
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalEnlace && (
        <Modal onClose={() => setModalEnlace(null)}>
          <h2>Generar enlace de pago</h2>
          <p className="mini">El paciente paga online con tarjeta; en cuanto lo hace, se registra el cobro solo.</p>
          <form onSubmit={generarEnlace}>
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div className="f">
                <label>Paciente</label>
                <select name="pacienteId" defaultValue={modalEnlace.pacienteId || ''} required>
                  <option value="">—</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.apellidos}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Importe</label>
                <input type="number" name="importe" step="0.01" min="0.5" required />
              </div>
            </div>
            <div className="f">
              <label>Concepto</label>
              <input name="concepto" placeholder="Tratamiento, corona 26…" />
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="btn gh" type="button" onClick={() => setModalEnlace(null)}>
                Cancelar
              </button>
              <button className="btn pri" type="submit" disabled={generandoEnlace}>
                {generandoEnlace ? 'Generando…' : 'Generar y enviar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modalAbierto && (
        <Modal onClose={() => setModalAbierto(null)}>
          <h2>Registrar cobro</h2>
          <form onSubmit={registrarCobro}>
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div className="f">
                <label>Paciente</label>
                <select name="pacienteId" defaultValue={pacientePreseleccionado?.id || ''} required>
                  <option value="">—</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.apellidos}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Fecha</label>
                <input type="date" name="fecha" defaultValue={hoyISO()} />
              </div>
              <div className="f">
                <label>Importe</label>
                <input type="number" name="importe" step="0.01" defaultValue={pendientePreseleccionado ? pendientePreseleccionado.toFixed(2) : ''} required />
              </div>
              <div className="f">
                <label>Tipo</label>
                <select name="tipo" defaultValue="pago">
                  <option value="pago">Pago de tratamiento</option>
                  <option value="anticipo">Entrega a cuenta</option>
                </select>
              </div>
              <div className="f">
                <label>Forma de pago</label>
                <select name="forma" defaultValue="tarjeta">
                  {FORMAS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="f">
              <label>Concepto</label>
              <input name="concepto" placeholder="A cuenta tratamiento, corona 26…" />
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="btn gh" type="button" onClick={() => setModalAbierto(null)}>
                Cancelar
              </button>
              <button className="btn pri" type="submit">
                Guardar cobro
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
