import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { costeTotalPresupuesto, financiacion, totalPresupuesto } from '@powerdent/shared';
import type { LineaPresupuesto } from '@powerdent/shared';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
}

interface ItemTarifario {
  id: string;
  codigo: string;
  nombre: string;
  pvp: number;
  coste: number;
}

interface LineaApi {
  id: string;
  codigo: string;
  nombre: string;
  pieza: string | null;
  cantidad: number;
  pvp: number;
  coste: number;
}

type EstadoPresupuesto = 'borrador' | 'enviado' | 'aceptado' | 'rechazado';

interface Presupuesto {
  id: string;
  fecha: string;
  validezDias: number;
  descuentoPct: number;
  estado: EstadoPresupuesto;
  notas: string | null;
  paciente: Paciente;
  lineas: LineaApi[];
}

const TAG_ESTADO: Record<EstadoPresupuesto, string> = {
  borrador: 'tag',
  enviado: 'tag info',
  aceptado: 'tag ok',
  rechazado: 'tag bad',
};

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

interface Borrador {
  id?: string;
  pacienteId: string;
  fecha: string;
  validezDias: number;
  descuentoPct: number;
  notas: string;
  lineas: LineaPresupuesto[];
}

function borradorVacio(pacienteId = ''): Borrador {
  return { pacienteId, fecha: new Date().toISOString().slice(0, 10), validezDias: 30, descuentoPct: 0, notas: '', lineas: [] };
}

export function Presupuestos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lista, setLista] = useState<Presupuesto[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [tarifario, setTarifario] = useState<ItemTarifario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [tarSel, setTarSel] = useState('');
  const [cantSel, setCantSel] = useState(1);
  const [piezaSel, setPiezaSel] = useState('');

  async function cargar() {
    setCargando(true);
    setLista(await api.get<Presupuesto[]>('/presupuestos'));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    api.get<Paciente[]>('/pacientes').then(setPacientes);
    api.get<ItemTarifario[]>('/catalogos/tarifario').then(setTarifario);
  }, []);

  useEffect(() => {
    const pacienteId = searchParams.get('paciente');
    if (pacienteId) {
      nuevo(pacienteId);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitidos = lista.length;
  const enviados = lista.filter((p) => p.estado === 'enviado').length;
  const aceptados = lista.filter((p) => p.estado === 'aceptado');
  const tasa = emitidos ? Math.round((aceptados.length / emitidos) * 100) : 0;
  const totalAceptado = aceptados.reduce((a, p) => a + totalPresupuesto(mapLineas(p.lineas), p.descuentoPct), 0);

  function mapLineas(lineas: LineaApi[]): LineaPresupuesto[] {
    return lineas.map((l) => ({ id: l.id, cod: l.codigo, n: l.nombre, pieza: l.pieza, cant: l.cantidad, pvp: l.pvp, coste: l.coste }));
  }

  function nuevo(pacienteId?: string) {
    setBorrador(borradorVacio(pacienteId));
    setTarSel('');
    setCantSel(1);
    setPiezaSel('');
  }

  function editar(p: Presupuesto) {
    setBorrador({
      id: p.id,
      pacienteId: p.paciente.id,
      fecha: p.fecha.slice(0, 10),
      validezDias: p.validezDias,
      descuentoPct: p.descuentoPct,
      notas: p.notas || '',
      lineas: mapLineas(p.lineas),
    });
    setTarSel('');
    setCantSel(1);
    setPiezaSel('');
  }

  function addLinea() {
    const t = tarifario.find((x) => x.id === tarSel);
    if (!t || !borrador) return;
    setBorrador({
      ...borrador,
      lineas: [...borrador.lineas, { id: crypto.randomUUID(), cod: t.codigo, n: t.nombre, pieza: piezaSel, cant: cantSel, pvp: t.pvp, coste: t.coste }],
    });
    setPiezaSel('');
  }

  function addLibre() {
    if (!borrador) return;
    setBorrador({ ...borrador, lineas: [...borrador.lineas, { id: crypto.randomUUID(), cod: '', n: '', pieza: '', cant: 1, pvp: 0, coste: 0 }] });
  }

  function actualizarLinea(i: number, cambios: Partial<LineaPresupuesto>) {
    if (!borrador) return;
    const lineas = borrador.lineas.map((l, idx) => (idx === i ? { ...l, ...cambios } : l));
    setBorrador({ ...borrador, lineas });
  }

  function quitarLinea(i: number) {
    if (!borrador) return;
    setBorrador({ ...borrador, lineas: borrador.lineas.filter((_, idx) => idx !== i) });
  }

  async function guardar(estado: EstadoPresupuesto) {
    if (!borrador || !borrador.pacienteId) return;
    const payload = {
      pacienteId: borrador.pacienteId,
      fecha: new Date(`${borrador.fecha}T00:00:00`).toISOString(),
      validezDias: Number(borrador.validezDias) || 30,
      descuentoPct: Number(borrador.descuentoPct) || 0,
      estado,
      notas: borrador.notas || undefined,
      lineas: borrador.lineas.map((l) => ({
        codigo: l.cod,
        nombre: l.n,
        pieza: l.pieza || undefined,
        cantidad: Number(l.cant) || 1,
        pvp: Number(l.pvp) || 0,
        coste: Number(l.coste) || 0,
      })),
    };
    if (borrador.id) await api.put(`/presupuestos/${borrador.id}`, payload);
    else await api.post('/presupuestos', payload);
    setBorrador(null);
    cargar();
  }

  const total = borrador ? totalPresupuesto(borrador.lineas, borrador.descuentoPct) : 0;
  const coste = borrador ? costeTotalPresupuesto(borrador.lineas) : 0;
  const fin = useMemo(() => (total > 0 ? financiacion(total, 12, 15) : null), [total]);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Presupuestos</h1>
          <p>Oferta clara, coste y margen a la vista</p>
        </div>
        <div className="acciones">
          <button className="btn pri" onClick={() => nuevo()}>
            Nuevo presupuesto
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Emitidos</span>
          <b>{emitidos}</b>
        </div>
        <div className="kpi">
          <span>Pendientes de respuesta</span>
          <b>{enviados}</b>
        </div>
        <div className="kpi">
          <span>Aceptación</span>
          <b>{tasa}%</b>
        </div>
        <div className="kpi">
          <span>Aceptado (€)</span>
          <b>{eur(totalAceptado)}</b>
        </div>
      </div>

      <div className="card">
        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : lista.length === 0 ? (
          <div className="vacio">Sin presupuestos.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Fecha</th>
                <th>Paciente</th>
                <th>Tratamientos</th>
                <th>Estado</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const nombres = p.lineas.map((l) => l.nombre).slice(0, 2).join(', ');
                return (
                  <tr key={p.id}>
                    <td className="mono">{p.id.slice(-6).toUpperCase()}</td>
                    <td>{new Date(p.fecha).toLocaleDateString('es-ES')}</td>
                    <td>
                      {p.paciente.nombre} {p.paciente.apellidos}
                    </td>
                    <td className="mini">
                      {nombres}
                      {p.lineas.length > 2 ? ` +${p.lineas.length - 2}` : ''}
                    </td>
                    <td>
                      <span className={TAG_ESTADO[p.estado]}>{p.estado}</span>
                    </td>
                    <td className="num">{eur(totalPresupuesto(mapLineas(p.lineas), p.descuentoPct))}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn gh sm" onClick={() => editar(p)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {borrador && (
        <Modal onClose={() => setBorrador(null)} ancho={820}>
          <div className="entre">
            <h2>Presupuesto</h2>
            {borrador.id && <span className="mini">Nº {borrador.id.slice(-6).toUpperCase()}</span>}
          </div>

          <div className="grid g4" style={{ marginTop: 12 }}>
            <div className="f">
              <label>Paciente</label>
              <select value={borrador.pacienteId} onChange={(e) => setBorrador({ ...borrador, pacienteId: e.target.value })}>
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
              <input type="date" value={borrador.fecha} onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })} />
            </div>
            <div className="f">
              <label>Validez (días)</label>
              <input
                type="number"
                value={borrador.validezDias}
                onChange={(e) => setBorrador({ ...borrador, validezDias: Number(e.target.value) })}
              />
            </div>
            <div className="f">
              <label>Descuento %</label>
              <input
                type="number"
                value={borrador.descuentoPct}
                onChange={(e) => setBorrador({ ...borrador, descuentoPct: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="fila" style={{ margin: '6px 0 12px' }}>
            <select value={tarSel} onChange={(e) => setTarSel(e.target.value)} style={{ maxWidth: 340 }}>
              <option value="">— tarifario —</option>
              {tarifario.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} · {t.nombre} — {eur(t.pvp)}
                </option>
              ))}
            </select>
            <input type="number" value={cantSel} min={1} onChange={(e) => setCantSel(Number(e.target.value))} style={{ width: 70 }} />
            <input placeholder="Pieza (ej. 26)" value={piezaSel} onChange={(e) => setPiezaSel(e.target.value)} style={{ width: 120 }} />
            <button className="btn pri sm" onClick={addLinea}>
              Añadir
            </button>
            <button className="btn gh sm" onClick={addLibre}>
              Línea libre
            </button>
          </div>

          {borrador.lineas.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Tratamiento</th>
                  <th>Pieza</th>
                  <th>Cant.</th>
                  <th className="num">PVP</th>
                  <th className="num">Coste</th>
                  <th className="num">Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {borrador.lineas.map((l, i) => (
                  <tr key={l.id}>
                    <td>
                      <input value={l.n} onChange={(e) => actualizarLinea(i, { n: e.target.value })} />
                    </td>
                    <td>
                      <input value={l.pieza || ''} style={{ width: 70 }} onChange={(e) => actualizarLinea(i, { pieza: e.target.value })} />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={l.cant}
                        style={{ width: 60 }}
                        onChange={(e) => actualizarLinea(i, { cant: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={l.pvp}
                        style={{ width: 85 }}
                        onChange={(e) => actualizarLinea(i, { pvp: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={l.coste}
                        style={{ width: 85 }}
                        onChange={(e) => actualizarLinea(i, { coste: Number(e.target.value) })}
                      />
                    </td>
                    <td className="num">{eur((l.pvp || 0) * (l.cant || 1))}</td>
                    <td>
                      <button className="btn gh sm" onClick={() => quitarLinea(i)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="vacio">Añade tratamientos del tarifario.</div>
          )}

          {borrador.lineas.length > 0 && (
            <>
              <div className="entre" style={{ marginTop: 10 }}>
                <span className="mini">
                  Coste directo {eur(coste)} · margen {eur(total - coste)} ({total ? Math.round(((total - coste) / total) * 100) : 0}%)
                </span>
                <div className="disp" style={{ fontSize: 22 }}>
                  {eur(total)}
                </div>
              </div>
              {fin && (
                <div className="fin">
                  <div>
                    <small>PAGO APLAZADO</small>
                    <b>
                      {fin.n} × {eur(fin.cuota)}
                    </b>
                  </div>
                  <div className="mini">
                    al mes · TIN {fin.tin}% · TAE {fin.tae.toFixed(2).replace('.', ',')}%
                    <br />
                    Total aplazado {eur(fin.total)} · intereses {eur(fin.intereses)}
                  </div>
                  <div className="mini" style={{ marginLeft: 'auto' }}>
                    Al contado hoy: <b>{eur(total)}</b>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="f" style={{ marginTop: 12 }}>
            <label>Notas para el paciente</label>
            <textarea
              value={borrador.notas}
              placeholder="Plan por fases, forma de pago, financiación…"
              onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })}
            />
          </div>

          <div className="fila" style={{ justifyContent: 'flex-end' }}>
            <button className="btn gh" onClick={() => setBorrador(null)}>
              Cancelar
            </button>
            <button className="btn gh" onClick={() => guardar('borrador')}>
              Guardar borrador
            </button>
            <button className="btn gh" onClick={() => guardar('enviado')}>
              Marcar enviado
            </button>
            <button className="btn pri" onClick={() => guardar('aceptado')}>
              Marcar aceptado
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
