import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { stockAPedir, stockHay } from '@powerdent/shared';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/Modal';

interface Proveedor {
  id: string;
  nombre: string;
}

interface StockItem {
  id: string;
  nombre: string;
  departamento: string;
  proveedorId: string | null;
  diaEntrega: string | null;
  cantidad: number;
  contado: number | null;
  minimo: number;
  objetivo: number;
  unidad: string;
  coste: number;
  activo: boolean;
  orden: number;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function Almacen() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [s, p] = await Promise.all([api.get<StockItem[]>('/almacen/stock'), api.get<Proveedor[]>('/compras/proveedores')]);
    setStock(s);
    setProveedores(p);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const departamentos = useMemo(() => {
    const mapa = new Map<string, StockItem[]>();
    for (const s of stock) {
      const lista = mapa.get(s.departamento) || [];
      lista.push(s);
      mapa.set(s.departamento, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.orden - b.orden);
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [stock]);

  const activos = stock.filter((s) => s.activo);
  const aPedirTotal = activos.filter((s) => stockAPedir(s) > 0).length;
  const contadas = activos.filter((s) => s.contado != null).length;

  function actualizarLocal(id: string, cambios: Partial<StockItem>) {
    setStock((st) => st.map((s) => (s.id === id ? { ...s, ...cambios } : s)));
  }

  async function guardarCampo(id: string, campo: keyof StockItem, valor: unknown) {
    actualizarLocal(id, { [campo]: valor } as Partial<StockItem>);
    await api.put(`/almacen/stock/${id}`, { [campo]: valor });
  }

  async function anadirProducto(departamento?: string) {
    const nuevo = await api.post<StockItem>('/almacen/stock', { nombre: 'Nuevo producto', departamento: departamento || 'Sin departamento', minimo: 2, objetivo: 4 });
    setStock((s) => [...s, nuevo]);
  }

  async function borrarProducto(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}" del almacén? Si solo quieres dejar de contarlo, anúlalo con ∅.`)) return;
    await api.del(`/almacen/stock/${id}`);
    setStock((s) => s.filter((x) => x.id !== id));
  }

  async function mover(id: string, direccion: -1 | 1) {
    await api.post(`/almacen/stock/${id}/mover`, { direccion });
    await cargar();
  }

  async function renombrarDepartamento() {
    if (!renombrando || !nombreNuevo.trim()) return;
    const items = stock.filter((s) => s.departamento === renombrando);
    await Promise.all(items.map((s) => api.put(`/almacen/stock/${s.id}`, { departamento: nombreNuevo.trim() })));
    setStock((st) => st.map((s) => (s.departamento === renombrando ? { ...s, departamento: nombreNuevo.trim() } : s)));
    setRenombrando(null);
    setNombreNuevo('');
  }

  async function guardarConteo() {
    const r = await api.post<{ actualizados: number }>('/almacen/conteo/guardar');
    await cargar();
    setMensaje(`Conteo guardado · ${r.actualizados} referencias actualizadas`);
  }

  async function nuevoConteo() {
    if (!confirm('¿Empezar un conteo nuevo? Se vacía la columna Cuento.')) return;
    await api.post('/almacen/conteo/nuevo');
    await cargar();
  }

  async function crearPedidosDesdeConteo() {
    try {
      const r = await api.post<{ pedidos: number; sinProveedor: number }>('/almacen/pedidos-desde-conteo');
      setMensaje(
        r.pedidos === 0
          ? 'Nada por debajo del stock de seguridad.'
          : `${r.pedidos} pedido(s) borrador creado(s)${r.sinProveedor ? ` · ${r.sinProveedor} referencias sin proveedor no incluidas` : ''}.`,
      );
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.message : 'No se pudieron crear los pedidos');
    }
  }

  if (cargando) return <p className="mini">Cargando…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Almacén · conteo y pedido</h1>
          <p>Cuenta lo que hay, el sistema calcula lo que falta</p>
        </div>
        <div className="acciones">
          <button className="btn gh" onClick={() => anadirProducto()}>
            + Producto
          </button>
          <button className="btn gh" onClick={guardarConteo}>
            Guardar conteo
          </button>
          <button className="btn gh" onClick={nuevoConteo}>
            Nuevo conteo
          </button>
          <Link className="btn pri" to="/gestion/compras">
            Ir a Compras
          </Link>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Referencias</span>
          <b>{activos.length}</b>
        </div>
        <div className="kpi">
          <span>Referencias a pedir</span>
          <b style={{ color: aPedirTotal ? 'var(--marca)' : 'inherit' }}>{aPedirTotal}</b>
        </div>
        <div className="kpi">
          <span>Contadas</span>
          <b>
            {contadas}
            <span className="mini"> de {activos.length}</span>
          </b>
        </div>
        <div className="kpi">
          <span>Departamentos</span>
          <b>{departamentos.length}</b>
        </div>
      </div>

      {mensaje && (
        <p className="mini" style={{ marginBottom: 10 }}>
          {mensaje}
        </p>
      )}

      {departamentos.map(([depto, items]) => {
        const pedirDep = items.filter((s) => s.activo).reduce((a, s) => a + stockAPedir(s), 0);
        return (
          <div className="card" key={depto}>
            <div className="entre">
              <h3>{depto}</h3>
              <div className="fila">
                <span className={`tag ${pedirDep ? 'warn' : 'ok'}`}>{pedirDep ? `${pedirDep} uds. a pedir` : 'completo'}</span>
                <button
                  className="btn gh sm"
                  onClick={() => {
                    setRenombrando(depto);
                    setNombreNuevo(depto);
                  }}
                >
                  Renombrar
                </button>
                <button className="btn gh sm" onClick={() => anadirProducto(depto)}>
                  + Producto
                </button>
              </div>
            </div>
            <hr />
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Proveedor</th>
                    <th>Entrega</th>
                    <th className="num">Mínimo</th>
                    <th className="num">Objetivo</th>
                    <th className="num">Cuento</th>
                    <th className="num">A pedir</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s, i) => {
                    const pedir = stockAPedir(s);
                    return (
                      <tr key={s.id} style={s.activo ? undefined : { opacity: 0.45, textDecoration: 'line-through' }}>
                        <td>
                          <input defaultValue={s.nombre} onBlur={(e) => guardarCampo(s.id, 'nombre', e.target.value)} />
                        </td>
                        <td>
                          <select defaultValue={s.proveedorId || ''} onChange={(e) => guardarCampo(s.id, 'proveedorId', e.target.value || null)} style={{ width: 140 }}>
                            <option value="">—</option>
                            {proveedores.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select defaultValue={s.diaEntrega || ''} onChange={(e) => guardarCampo(s.id, 'diaEntrega', e.target.value || null)} style={{ width: 112 }}>
                            <option value="">—</option>
                            {DIAS.map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="number" style={{ width: 70 }} defaultValue={s.minimo} onBlur={(e) => guardarCampo(s.id, 'minimo', Number(e.target.value) || 0)} />
                        </td>
                        <td>
                          <input type="number" style={{ width: 70 }} defaultValue={s.objetivo} onBlur={(e) => guardarCampo(s.id, 'objetivo', Number(e.target.value) || 0)} />
                        </td>
                        <td>
                          <input
                            type="number"
                            style={{ width: 78 }}
                            placeholder={String(s.cantidad)}
                            defaultValue={s.contado ?? ''}
                            onBlur={(e) => guardarCampo(s.id, 'contado', e.target.value === '' ? null : Number(e.target.value))}
                          />
                        </td>
                        <td className="num" style={{ fontWeight: pedir && s.activo ? 700 : 400, color: pedir && s.activo ? 'var(--marca)' : 'inherit' }}>
                          {s.activo ? pedir : '—'}
                        </td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn gh sm" title={s.activo ? 'Anular' : 'Reactivar'} onClick={() => guardarCampo(s.id, 'activo', !s.activo)}>
                            {s.activo ? '∅' : '↺'}
                          </button>
                          <button className="btn gh sm" disabled={i === 0} onClick={() => mover(s.id, -1)}>
                            ↑
                          </button>
                          <button className="btn gh sm" disabled={i === items.length - 1} onClick={() => mover(s.id, 1)}>
                            ↓
                          </button>
                          <button className="btn gh sm" onClick={() => borrarProducto(s.id, s.nombre)}>
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="card">
        <div className="entre">
          <h3>Resumen del pedido</h3>
          <button className="btn pri sm" onClick={crearPedidosDesdeConteo}>
            Crear pedidos borrador
          </button>
        </div>
        <hr />
        {aPedirTotal === 0 ? (
          <div className="vacio">Nada por debajo del stock de seguridad.</div>
        ) : (
          [...proveedores.map((p) => ({ id: p.id, nombre: p.nombre })), { id: '', nombre: 'Sin proveedor' }]
            .map((p) => ({ p, items: stock.filter((s) => s.activo && (s.proveedorId || '') === p.id && stockAPedir(s) > 0) }))
            .filter((g) => g.items.length)
            .map(({ p, items }) => (
              <div key={p.id || 'sin-proveedor'} style={{ marginBottom: 14 }}>
                <b>{p.nombre}</b>
                <table>
                  <tbody>
                    {items.map((s) => (
                      <tr key={s.id}>
                        <td>{s.nombre}</td>
                        <td className="mini">
                          hay {stockHay(s)} · mín. {s.minimo} · objetivo {s.objetivo} {s.unidad ? `(${s.unidad})` : ''}
                        </td>
                        <td className="num" style={{ color: 'var(--marca)', fontWeight: 700 }}>
                          {stockAPedir(s)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
        )}
      </div>

      {renombrando && (
        <Modal onClose={() => setRenombrando(null)}>
          <h2>Renombrar departamento</h2>
          <div className="f" style={{ marginTop: 12 }}>
            <label>Nombre</label>
            <input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} autoFocus />
          </div>
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn gh" onClick={() => setRenombrando(null)}>
              Cancelar
            </button>
            <button className="btn pri" onClick={renombrarDepartamento}>
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
