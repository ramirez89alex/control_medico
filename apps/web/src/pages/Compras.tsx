import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/Modal';

interface Proveedor {
  id: string;
  nombre: string;
  contacto: string | null;
  diasEntrega: number;
  pedidoMinimo: number;
}

interface LineaPedido {
  stockId: string | null;
  nombre: string;
  cantidad: number;
  precio: number;
}

type EstadoPedido = 'borrador' | 'enviado' | 'recibido';

interface Pedido {
  id: string;
  proveedorId: string;
  proveedor: Proveedor;
  fecha: string;
  previsto: string | null;
  estado: EstadoPedido;
  nota: string | null;
  lineas: LineaPedido[];
  recibidoFecha: string | null;
  albaranNumero: string | null;
  facturaNumero: string | null;
  facturaFecha: string | null;
  facturaImporte: number | null;
  facturaVence: string | null;
  facturaPagada: boolean;
}

interface StockItem {
  id: string;
  nombre: string;
  cantidad: number;
  minimo: number;
  coste: number;
  proveedorId: string | null;
  historial: Array<{ fecha: string; precio: number; cantidad: number }>;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function totPedido(lineas: LineaPedido[]) {
  return lineas.reduce((a, l) => a + l.cantidad * l.precio, 0);
}

const ESTADO_TAG: Record<EstadoPedido, string> = { borrador: 'tag', enviado: 'tag info', recibido: 'tag ok' };

export function Compras() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalProveedores, setModalProveedores] = useState(false);
  const [editando, setEditando] = useState<{ id?: string; proveedorId: string; fecha: string; previsto: string; nota: string; lineas: LineaPedido[] } | null>(null);
  const [recibiendo, setRecibiendo] = useState<Pedido | null>(null);
  const [facturando, setFacturando] = useState<Pedido | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [p, ped, s] = await Promise.all([
      api.get<Proveedor[]>('/compras/proveedores'),
      api.get<Pedido[]>('/compras/pedidos'),
      api.get<StockItem[]>('/almacen/stock'),
    ]);
    setProveedores(p);
    setPedidos(ped);
    setStock(s);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const mes = hoyISO().slice(0, 7);
  const transito = pedidos.filter((x) => x.estado === 'enviado');
  const gastoMes = pedidos.filter((x) => x.estado === 'recibido' && (x.recibidoFecha || '').slice(0, 7) === mes).reduce((a, x) => a + totPedido(x.lineas), 0);
  const bajoMinimo = stock.filter((s) => s.cantidad <= s.minimo);
  const recibidos = pedidos.filter((x) => x.estado === 'recibido');
  const debeProveedores = recibidos.filter((x) => x.facturaNumero && !x.facturaPagada).reduce((a, x) => a + (x.facturaImporte || 0), 0);

  const variacionPrecios = useMemo(() => {
    return stock
      .filter((s) => s.historial.length)
      .map((s) => {
        const hh = s.historial.slice(-2);
        const ant = hh[0].precio;
        const ult = hh[hh.length - 1].precio;
        return { nombre: s.nombre, ant, ult, variacion: ant ? ((ult - ant) / ant) * 100 : 0, fecha: hh[hh.length - 1].fecha };
      })
      .sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion));
  }, [stock]);

  function abrirNuevoPedido() {
    setEditando({ proveedorId: proveedores[0]?.id || '', fecha: hoyISO(), previsto: '', nota: '', lineas: [] });
  }

  function abrirEditarPedido(p: Pedido) {
    setEditando({ id: p.id, proveedorId: p.proveedorId, fecha: p.fecha.slice(0, 10), previsto: p.previsto?.slice(0, 10) || '', nota: p.nota || '', lineas: p.lineas });
  }

  function anadirLineaDesdeStock(stockId: string) {
    if (!editando) return;
    const s = stock.find((x) => x.id === stockId);
    if (!s) return;
    const sugerida = Math.max(1, s.minimo * 2 - s.cantidad);
    setEditando({ ...editando, lineas: [...editando.lineas, { stockId: s.id, nombre: s.nombre, cantidad: sugerida, precio: s.coste }] });
  }

  function anadirLineaLibre() {
    if (!editando) return;
    setEditando({ ...editando, lineas: [...editando.lineas, { stockId: null, nombre: '', cantidad: 1, precio: 0 }] });
  }

  function actualizarLinea(i: number, cambios: Partial<LineaPedido>) {
    if (!editando) return;
    const lineas = editando.lineas.map((l, idx) => (idx === i ? { ...l, ...cambios } : l));
    setEditando({ ...editando, lineas });
  }

  function quitarLinea(i: number) {
    if (!editando) return;
    setEditando({ ...editando, lineas: editando.lineas.filter((_, idx) => idx !== i) });
  }

  async function guardarPedido(estado: 'borrador' | 'enviado') {
    if (!editando || !editando.proveedorId || editando.lineas.length === 0) return;
    const body = {
      proveedorId: editando.proveedorId,
      fecha: new Date(`${editando.fecha}T00:00:00`).toISOString(),
      previsto: editando.previsto ? new Date(`${editando.previsto}T00:00:00`).toISOString() : undefined,
      nota: editando.nota || undefined,
      lineas: editando.lineas.filter((l) => l.nombre && l.cantidad > 0),
    };
    try {
      if (editando.id) {
        await api.put(`/compras/pedidos/${editando.id}`, { ...body, estado });
      } else {
        const creado = await api.post<Pedido>('/compras/pedidos', body);
        if (estado === 'enviado') await api.put(`/compras/pedidos/${creado.id}`, { estado: 'enviado' });
      }
      setEditando(null);
      await cargar();
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.message : 'No se pudo guardar el pedido');
    }
  }

  async function recibirPedido(payload: { albaranNumero: string; facturaNumero: string; lineas: Array<{ index: number; cantidad: number; precio: number }> }) {
    if (!recibiendo) return;
    try {
      await api.post(`/compras/pedidos/${recibiendo.id}/recibir`, payload);
      setRecibiendo(null);
      await cargar();
      setMensaje('Entrada registrada en almacén');
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.message : 'No se pudo confirmar la recepción');
    }
  }

  async function guardarFactura(payload: { numero: string; fecha: string; importe: number; vence: string }) {
    if (!facturando) return;
    await api.put(`/compras/pedidos/${facturando.id}/factura`, {
      numero: payload.numero,
      fecha: new Date(`${payload.fecha}T00:00:00`).toISOString(),
      importe: payload.importe,
      vence: new Date(`${payload.vence}T00:00:00`).toISOString(),
    });
    setFacturando(null);
    await cargar();
  }

  async function pagarFactura(id: string) {
    await api.post(`/compras/pedidos/${id}/pagar`);
    await cargar();
  }

  async function pedidoAutomatico() {
    try {
      const r = await api.post<{ pedidos: number; sinProveedor: number }>('/compras/pedido-automatico');
      setMensaje(r.pedidos === 0 ? 'No hay nada bajo mínimo.' : `${r.pedidos} pedido(s) borrador creado(s)${r.sinProveedor ? ` · ${r.sinProveedor} referencias sin proveedor` : ''}.`);
      await cargar();
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.message : 'No se pudo generar el pedido automático');
    }
  }

  if (cargando) return <p className="mini">Cargando…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Compras y pedidos</h1>
          <p>Proveedores, pedidos en tránsito y variación de precios</p>
        </div>
        <div className="acciones">
          <Link className="btn gh" to="/gestion/almacen">
            Ir a Almacén
          </Link>
          <button className="btn gh" onClick={() => setModalProveedores(true)}>
            Proveedores
          </button>
          <button className="btn gh" onClick={pedidoAutomatico}>
            Pedido automático de mínimos
          </button>
          <button className="btn pri" onClick={abrirNuevoPedido} disabled={proveedores.length === 0}>
            Nuevo pedido
          </button>
        </div>
      </div>

      {proveedores.length === 0 && <p className="mini" style={{ marginBottom: 10 }}>Da de alta un proveedor antes de crear pedidos.</p>}
      {mensaje && (
        <p className="mini" style={{ marginBottom: 10 }}>
          {mensaje}
        </p>
      )}

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Gasto recibido este mes</span>
          <b>{eur(gastoMes)}</b>
        </div>
        <div className="kpi">
          <span>Pedidos en tránsito</span>
          <b>{transito.length}</b>
        </div>
        <div className="kpi">
          <span>Valor en tránsito</span>
          <b>{eur(transito.reduce((a, x) => a + totPedido(x.lineas), 0))}</b>
        </div>
        <div className="kpi">
          <span>Bajo mínimo</span>
          <b style={{ color: bajoMinimo.length ? 'var(--ambar)' : 'inherit' }}>{bajoMinimo.length}</b>
        </div>
      </div>

      <div className="card">
        <h3>Pedidos</h3>
        <hr />
        {pedidos.length === 0 ? (
          <div className="vacio">Sin pedidos. Genera uno automático con lo que está bajo mínimo.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Fecha</th>
                <th>Previsto</th>
                <th>Referencias</th>
                <th>Estado</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((x) => {
                const tarde = x.estado === 'enviado' && x.previsto && x.previsto.slice(0, 10) < hoyISO();
                return (
                  <tr key={x.id}>
                    <td>
                      <b>{x.proveedor.nombre}</b>
                    </td>
                    <td className="mini">{new Date(x.fecha).toLocaleDateString('es-ES')}</td>
                    <td className="mini" style={tarde ? { color: 'var(--rojo)', fontWeight: 600 } : undefined}>
                      {x.previsto ? new Date(x.previsto).toLocaleDateString('es-ES') : '—'}
                      {tarde ? ' ⚠' : ''}
                    </td>
                    <td className="mini">
                      {x.lineas.length} · {x.lineas.map((l) => l.nombre).slice(0, 2).join(', ')}
                    </td>
                    <td>
                      <span className={ESTADO_TAG[x.estado]}>{x.estado}</span>
                    </td>
                    <td className="num">{eur(totPedido(x.lineas))}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {x.estado === 'borrador' && (
                        <>
                          <button className="btn gh sm" onClick={() => abrirEditarPedido(x)}>
                            Editar
                          </button>{' '}
                          <button className="btn pri sm" onClick={() => api.put(`/compras/pedidos/${x.id}`, { estado: 'enviado' }).then(cargar)}>
                            Enviar
                          </button>
                        </>
                      )}
                      {x.estado === 'enviado' && (
                        <button className="btn pri sm" onClick={() => setRecibiendo(x)}>
                          Recibir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Albaranes y facturas de proveedor</h3>
        <hr />
        {recibidos.length === 0 ? (
          <div className="vacio">Aún no has recibido pedidos.</div>
        ) : (
          <>
            <p className="mini">
              Pendiente de pagar a proveedores: <b style={{ color: debeProveedores ? 'var(--marca)' : 'inherit' }}>{eur(debeProveedores)}</b>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Albarán</th>
                  <th>Factura</th>
                  <th>Vence</th>
                  <th className="num">Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recibidos.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <b>{x.proveedor.nombre}</b>
                      <div className="mini">recibido {x.recibidoFecha && new Date(x.recibidoFecha).toLocaleDateString('es-ES')}</div>
                    </td>
                    <td className="mono mini">{x.albaranNumero || '—'}</td>
                    <td className="mono mini">{x.facturaNumero || <span className="tag warn">sin factura</span>}</td>
                    <td className="mini" style={x.facturaVence && !x.facturaPagada && x.facturaVence.slice(0, 10) < hoyISO() ? { color: 'var(--rojo)' } : undefined}>
                      {x.facturaVence ? new Date(x.facturaVence).toLocaleDateString('es-ES') : ''}
                    </td>
                    <td className="num">{eur(x.facturaImporte ?? totPedido(x.lineas))}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {x.facturaNumero ? (
                        x.facturaPagada ? (
                          <span className="tag ok">pagada</span>
                        ) : (
                          <button className="btn pri sm" onClick={() => pagarFactura(x.id)}>
                            Marcar pagada
                          </button>
                        )
                      ) : (
                        <button className="btn gh sm" onClick={() => setFacturando(x)}>
                          Añadir factura
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h3>Variación de precios</h3>
        <p className="mini">Último precio pagado frente al anterior, por referencia.</p>
        <hr />
        {variacionPrecios.length === 0 ? (
          <div className="vacio">Aún no hay histórico. Al recibir pedidos se registra el precio de cada referencia.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Referencia</th>
                <th className="num">Anterior</th>
                <th className="num">Último</th>
                <th className="num">Variación</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {variacionPrecios.map((f, i) => (
                <tr key={i}>
                  <td>{f.nombre}</td>
                  <td className="num">{eur(f.ant)}</td>
                  <td className="num">{eur(f.ult)}</td>
                  <td className="num" style={{ color: f.variacion > 0.5 ? 'var(--rojo)' : f.variacion < -0.5 ? 'var(--verde, #1a7f4e)' : 'inherit', fontWeight: 600 }}>
                    {f.variacion > 0 ? '+' : ''}
                    {f.variacion.toFixed(1)}%
                  </td>
                  <td className="mini">{new Date(f.fecha).toLocaleDateString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalProveedores && (
        <ModalProveedores
          proveedores={proveedores}
          onClose={() => setModalProveedores(false)}
          onCambio={async (p) => {
            const actualizados = await p();
            setProveedores(actualizados);
          }}
        />
      )}

      {editando && (
        <Modal onClose={() => setEditando(null)} ancho={760}>
          <div className="entre">
            <h2>Pedido</h2>
          </div>
          <div className="grid g3" style={{ marginTop: 12 }}>
            <div className="f">
              <label>Proveedor</label>
              <select value={editando.proveedorId} onChange={(e) => setEditando({ ...editando, proveedorId: e.target.value })}>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="f">
              <label>Fecha del pedido</label>
              <input type="date" value={editando.fecha} onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} />
            </div>
            <div className="f">
              <label>Entrega prevista</label>
              <input type="date" value={editando.previsto} onChange={(e) => setEditando({ ...editando, previsto: e.target.value })} />
            </div>
          </div>
          <div className="fila" style={{ margin: '10px 0' }}>
            <select id="sel-stock-pedido" style={{ maxWidth: 320 }}>
              {stock.length === 0 && <option value="">(sin referencias en almacén)</option>}
              {stock.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — quedan {s.cantidad}
                </option>
              ))}
            </select>
            <button
              className="btn pri sm"
              onClick={() => {
                const sel = document.getElementById('sel-stock-pedido') as HTMLSelectElement | null;
                if (sel?.value) anadirLineaDesdeStock(sel.value);
              }}
            >
              Añadir
            </button>
            <button className="btn gh sm" onClick={anadirLineaLibre}>
              Línea libre
            </button>
          </div>
          {editando.lineas.length === 0 ? (
            <div className="vacio">Añade referencias del almacén.</div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Precio ud.</th>
                    <th className="num">Importe</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {editando.lineas.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <input value={l.nombre} onChange={(e) => actualizarLinea(i, { nombre: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" style={{ width: 80 }} value={l.cantidad} onChange={(e) => actualizarLinea(i, { cantidad: Number(e.target.value) || 0 })} />
                      </td>
                      <td>
                        <input type="number" step="0.01" style={{ width: 95 }} value={l.precio} onChange={(e) => actualizarLinea(i, { precio: Number(e.target.value) || 0 })} />
                      </td>
                      <td className="num">{eur(l.precio * l.cantidad)}</td>
                      <td>
                        <button className="btn gh sm" onClick={() => quitarLinea(i)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="entre" style={{ marginTop: 8 }}>
                <span className="mini">{editando.lineas.length} referencias</span>
                <div style={{ fontSize: 20 }}>{eur(totPedido(editando.lineas))}</div>
              </div>
            </>
          )}
          <div className="f" style={{ marginTop: 10 }}>
            <label>Nota para el proveedor</label>
            <input value={editando.nota} onChange={(e) => setEditando({ ...editando, nota: e.target.value })} />
          </div>
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn gh" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="btn gh" onClick={() => guardarPedido('borrador')} disabled={!editando.proveedorId || editando.lineas.length === 0}>
              Guardar borrador
            </button>
            <button className="btn pri" onClick={() => guardarPedido('enviado')} disabled={!editando.proveedorId || editando.lineas.length === 0}>
              Marcar enviado
            </button>
          </div>
        </Modal>
      )}

      {recibiendo && <ModalRecibir pedido={recibiendo} onClose={() => setRecibiendo(null)} onConfirmar={recibirPedido} />}

      {facturando && <ModalFactura pedido={facturando} onClose={() => setFacturando(null)} onGuardar={guardarFactura} />}
    </div>
  );
}

function ModalProveedores({ proveedores, onClose, onCambio }: { proveedores: Proveedor[]; onClose: () => void; onCambio: (fn: () => Promise<Proveedor[]>) => void }) {
  async function anadir() {
    onCambio(async () => {
      await api.post('/compras/proveedores', { nombre: 'Nuevo proveedor', diasEntrega: 3, pedidoMinimo: 0 });
      return api.get<Proveedor[]>('/compras/proveedores');
    });
  }

  async function guardar(id: string, campo: keyof Proveedor, valor: unknown) {
    onCambio(async () => {
      await api.put(`/compras/proveedores/${id}`, { [campo]: valor });
      return api.get<Proveedor[]>('/compras/proveedores');
    });
  }

  async function borrar(id: string) {
    onCambio(async () => {
      try {
        await api.del(`/compras/proveedores/${id}`);
      } catch {
        alert('No se puede eliminar: tiene referencias de almacén o pedidos asociados.');
      }
      return api.get<Proveedor[]>('/compras/proveedores');
    });
  }

  return (
    <Modal onClose={onClose} ancho={640}>
      <div className="entre">
        <h2>Proveedores</h2>
        <button className="btn pri sm" onClick={anadir}>
          Añadir
        </button>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Contacto</th>
            <th className="num">Días entrega</th>
            <th className="num">Pedido mínimo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {proveedores.length === 0 && (
            <tr>
              <td colSpan={5} className="mini">
                Sin proveedores todavía.
              </td>
            </tr>
          )}
          {proveedores.map((p) => (
            <tr key={p.id}>
              <td>
                <input defaultValue={p.nombre} onBlur={(e) => guardar(p.id, 'nombre', e.target.value)} />
              </td>
              <td>
                <input defaultValue={p.contacto || ''} placeholder="email o teléfono" onBlur={(e) => guardar(p.id, 'contacto', e.target.value)} />
              </td>
              <td>
                <input type="number" style={{ width: 70 }} defaultValue={p.diasEntrega} onBlur={(e) => guardar(p.id, 'diasEntrega', Number(e.target.value) || 3)} />
              </td>
              <td>
                <input type="number" style={{ width: 90 }} defaultValue={p.pedidoMinimo} onBlur={(e) => guardar(p.id, 'pedidoMinimo', Number(e.target.value) || 0)} />
              </td>
              <td>
                <button className="btn gh sm" onClick={() => borrar(p.id)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn pri" onClick={onClose}>
          Listo
        </button>
      </div>
    </Modal>
  );
}

function ModalRecibir({
  pedido,
  onClose,
  onConfirmar,
}: {
  pedido: Pedido;
  onClose: () => void;
  onConfirmar: (payload: { albaranNumero: string; facturaNumero: string; lineas: Array<{ index: number; cantidad: number; precio: number }> }) => void;
}) {
  const [lineas, setLineas] = useState(pedido.lineas.map((l) => ({ cantidad: l.cantidad, precio: l.precio })));
  const [albaran, setAlbaran] = useState('');
  const [factura, setFactura] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    onConfirmar({
      albaranNumero: albaran,
      facturaNumero: factura,
      lineas: lineas.map((l, index) => ({ index, cantidad: l.cantidad, precio: l.precio })),
    });
  }

  return (
    <Modal onClose={onClose} ancho={640}>
      <h2>Recibir pedido de {pedido.proveedor.nombre}</h2>
      <p className="mini">Confirma cantidades y precios del albarán: se suman al almacén y se guarda el precio para el histórico.</p>
      <form onSubmit={enviar}>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Referencia</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio real ud.</th>
            </tr>
          </thead>
          <tbody>
            {pedido.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.nombre}</td>
                <td>
                  <input
                    type="number"
                    style={{ width: 80 }}
                    value={lineas[i].cantidad}
                    onChange={(e) => setLineas((ls) => ls.map((x, idx) => (idx === i ? { ...x, cantidad: Number(e.target.value) || 0 } : x)))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    style={{ width: 95 }}
                    value={lineas[i].precio}
                    onChange={(e) => setLineas((ls) => ls.map((x, idx) => (idx === i ? { ...x, precio: Number(e.target.value) || 0 } : x)))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid g2" style={{ marginTop: 12 }}>
          <div className="f">
            <label>Nº de albarán</label>
            <input placeholder="ALB-2026-014" value={albaran} onChange={(e) => setAlbaran(e.target.value)} />
          </div>
          <div className="f">
            <label>Nº de factura (si viene)</label>
            <input placeholder="F-2026-0087" value={factura} onChange={(e) => setFactura(e.target.value)} />
          </div>
        </div>
        <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn gh" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn pri">Confirmar entrada</button>
        </div>
      </form>
    </Modal>
  );
}

function ModalFactura({ pedido, onClose, onGuardar }: { pedido: Pedido; onClose: () => void; onGuardar: (payload: { numero: string; fecha: string; importe: number; vence: string }) => void }) {
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [importe, setImporte] = useState(totPedido(pedido.lineas));
  const vence30 = new Date();
  vence30.setDate(vence30.getDate() + 30);
  const [vence, setVence] = useState(vence30.toISOString().slice(0, 10));

  function enviar(e: FormEvent) {
    e.preventDefault();
    onGuardar({ numero, fecha, importe, vence });
  }

  return (
    <Modal onClose={onClose}>
      <h2>Factura de {pedido.proveedor.nombre}</h2>
      <form onSubmit={enviar}>
        <div className="grid g2" style={{ marginTop: 12 }}>
          <div className="f">
            <label>Nº de factura</label>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} required />
          </div>
          <div className="f">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="f">
            <label>Importe</label>
            <input type="number" step="0.01" value={importe} onChange={(e) => setImporte(Number(e.target.value) || 0)} />
          </div>
          <div className="f">
            <label>Vencimiento</label>
            <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          </div>
        </div>
        <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn gh" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn pri">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
