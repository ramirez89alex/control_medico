import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/Modal';

interface Movimiento {
  id: string;
  fecha: string;
  concepto: string;
  importe: number;
  conciliado: boolean;
  conciliadoNota: string | null;
}

interface Candidato {
  id: string;
  etiqueta: string;
  importe: number;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function Banco() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [candidatos, setCandidatos] = useState<{ facturas: Candidato[]; pedidos: Candidato[] }>({ facturas: [], pedidos: [] });
  const [cargando, setCargando] = useState(true);
  const [pegando, setPegando] = useState(false);
  const [casando, setCasando] = useState<Movimiento | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [m, c] = await Promise.all([
      api.get<Movimiento[]>('/banco'),
      api.get<{ facturas: Candidato[]; pedidos: Candidato[] }>('/banco/candidatos'),
    ]);
    setMovimientos(m);
    setCandidatos(c);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const sinConciliar = movimientos.filter((m) => !m.conciliado);
  const entradas = movimientos.filter((m) => m.importe > 0).reduce((a, m) => a + m.importe, 0);
  const salidas = movimientos.filter((m) => m.importe < 0).reduce((a, m) => a + m.importe, 0);

  async function conciliarAuto() {
    const r = await api.post<{ conciliados: number }>('/banco/conciliar-auto');
    await cargar();
    setMensaje(r.conciliados ? `${r.conciliados} movimientos conciliados` : 'Nada que casar automáticamente');
  }

  async function importarTexto(texto: string) {
    try {
      const r = await api.post<{ importados: number }>('/banco/importar', { texto });
      setPegando(false);
      await cargar();
      setMensaje(r.importados ? `${r.importados} movimientos importados` : 'No he reconocido ninguna línea');
      if (r.importados) await conciliarAuto();
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.message : 'No se pudo importar el extracto');
    }
  }

  async function desconciliar(id: string) {
    await api.post(`/banco/${id}/desconciliar`);
    await cargar();
  }

  async function casar(payload: { tipo: 'factura' | 'pedido' | 'otro'; id?: string; nota?: string }) {
    if (!casando) return;
    await api.post(`/banco/${casando.id}/conciliar`, payload);
    setCasando(null);
    await cargar();
  }

  if (cargando) return <p className="mini">Cargando…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Banco y conciliación</h1>
          <p>Pega el extracto y cuadra con tus facturas, cobros y pedidos</p>
        </div>
        <div className="acciones">
          <button className="btn pri" onClick={() => setPegando(true)}>
            Pegar extracto
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Movimientos</span>
          <b>{movimientos.length}</b>
        </div>
        <div className="kpi">
          <span>Sin conciliar</span>
          <b style={{ color: sinConciliar.length ? 'var(--marca)' : 'inherit' }}>{sinConciliar.length}</b>
        </div>
        <div className="kpi">
          <span>Entradas</span>
          <b>{eur(entradas)}</b>
        </div>
        <div className="kpi">
          <span>Salidas</span>
          <b>{eur(salidas)}</b>
        </div>
      </div>

      {mensaje && (
        <p className="mini" style={{ marginBottom: 10 }}>
          {mensaje}
        </p>
      )}

      <div className="card">
        <div className="entre">
          <h3>Movimientos</h3>
          <button className="btn gh sm" onClick={conciliarAuto}>
            Conciliar automáticamente
          </button>
        </div>
        <hr />
        {movimientos.length === 0 ? (
          <div className="vacio">Pega aquí el extracto de tu banco: fecha, concepto e importe por línea.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th className="num">Importe</th>
                <th>Conciliado con</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="mini" style={{ width: 92 }}>
                    {new Date(m.fecha).toLocaleDateString('es-ES')}
                  </td>
                  <td>{m.concepto}</td>
                  <td className="num" style={{ color: m.importe < 0 ? 'var(--marca)' : 'var(--verde, #1a7f4e)' }}>
                    {eur(m.importe)}
                  </td>
                  <td className="mini">{m.conciliado ? m.conciliadoNota : <span className="tag warn">sin conciliar</span>}</td>
                  <td className="num">
                    {m.conciliado ? (
                      <button className="btn gh sm" onClick={() => desconciliar(m.id)}>
                        Quitar
                      </button>
                    ) : (
                      <button className="btn gh sm" onClick={() => setCasando(m)}>
                        Casar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pegando && <ModalPegar onCancelar={() => setPegando(false)} onImportar={importarTexto} />}

      {casando && <ModalCasar movimiento={casando} candidatos={candidatos} onCerrar={() => setCasando(null)} onCasar={casar} />}
    </div>
  );
}

function ModalPegar({ onCancelar, onImportar }: { onCancelar: () => void; onImportar: (texto: string) => void }) {
  const [texto, setTexto] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    onImportar(texto);
  }

  return (
    <Modal onClose={onCancelar} ancho={560}>
      <h2>Pegar extracto bancario</h2>
      <p className="mini">
        Copia las líneas desde la web del banco o desde el CSV. Acepta separadores de coma, punto y coma o tabulador; también líneas sueltas tipo{' '}
        <i>12/08/2026 TRANSFERENCIA ALBA H. 120,00</i>.
      </p>
      <form onSubmit={enviar}>
        <textarea
          style={{ minHeight: 190, fontFamily: "'IBM Plex Mono'", fontSize: 12.5 }}
          placeholder="12/08/2026;PAGO TARJETA CLINICA;120,00"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
        />
        <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" className="btn gh" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="btn pri" disabled={!texto.trim()}>
            Importar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalCasar({
  movimiento,
  candidatos,
  onCerrar,
  onCasar,
}: {
  movimiento: Movimiento;
  candidatos: { facturas: Candidato[]; pedidos: Candidato[] };
  onCerrar: () => void;
  onCasar: (payload: { tipo: 'factura' | 'pedido' | 'otro'; id?: string; nota?: string }) => void;
}) {
  const [seleccion, setSeleccion] = useState('');
  const [nota, setNota] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!seleccion) return onCasar({ tipo: 'otro', nota: nota || 'Otro concepto' });
    const [tipo, id] = seleccion.split(':') as ['factura' | 'pedido', string];
    onCasar({ tipo, id });
  }

  return (
    <Modal onClose={onCerrar}>
      <h2>Casar movimiento</h2>
      <p className="mini">
        {new Date(movimiento.fecha).toLocaleDateString('es-ES')} · {movimiento.concepto} · <b>{eur(movimiento.importe)}</b>
      </p>
      <form onSubmit={enviar}>
        <div className="f" style={{ marginTop: 12 }}>
          <label>Documento</label>
          <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)}>
            <option value="">— otro concepto (gasto o ingreso suelto) —</option>
            {candidatos.facturas.map((f) => (
              <option key={f.id} value={`factura:${f.id}`}>
                {f.etiqueta} · {eur(f.importe)}
              </option>
            ))}
            {candidatos.pedidos.map((p) => (
              <option key={p.id} value={`pedido:${p.id}`}>
                {p.etiqueta} · {eur(p.importe)}
              </option>
            ))}
          </select>
        </div>
        {!seleccion && (
          <div className="f">
            <label>Si es otro, descríbelo</label>
            <input placeholder="Alquiler, nómina, luz, devolución…" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        )}
        <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" className="btn gh" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn pri">Conciliar</button>
        </div>
      </form>
    </Modal>
  );
}
