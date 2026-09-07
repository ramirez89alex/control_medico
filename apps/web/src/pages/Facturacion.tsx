import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/Modal';
import { FacturaDocumento, type ColumnaFactura } from '../components/FacturaDocumento';
import type { ClinicaLegal } from '../lib/legal';

interface ClinicaFactura extends ClinicaLegal {
  facturaPie: string | null;
  facturaColumnas: ColumnaFactura[];
}

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  dni: string | null;
  direccion: string | null;
}

interface Cobro {
  id: string;
  fecha: string;
  importe: number;
  forma: string;
  concepto: string | null;
  paciente: Paciente;
}

interface LineaFactura {
  nombre: string;
  cantidad: number;
  pvp: number;
}

interface Factura {
  id: string;
  numero: string;
  fecha: string;
  cobroId: string | null;
  lineas: LineaFactura[];
  total: number;
  iva: number;
  exenta: boolean;
  conciliada: boolean;
  paciente: Paciente;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function Facturacion() {
  const [clinica, setClinica] = useState<ClinicaFactura | null>(null);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);
  const [viendo, setViendo] = useState<Factura | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const [cl, c, f] = await Promise.all([
      api.get<ClinicaFactura>('/catalogos/clinica'),
      api.get<Cobro[]>('/cobros'),
      api.get<Factura[]>('/facturacion'),
    ]);
    setClinica(cl);
    setCobros(c);
    setFacturas(f);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const sinFacturar = useMemo(() => {
    const facturados = new Set(facturas.map((f) => f.cobroId).filter(Boolean));
    return cobros.filter((c) => !facturados.has(c.id));
  }, [cobros, facturas]);

  const anio = new Date().getFullYear();
  const facturadoAnual = facturas.filter((f) => new Date(f.fecha).getFullYear() === anio).reduce((a, f) => a + f.total, 0);
  const sinConciliar = facturas.filter((f) => !f.conciliada).length;

  async function emitir(cobroId: string) {
    setEmitiendo(cobroId);
    setError(null);
    try {
      await api.post(`/facturacion/desde-cobro/${cobroId}`);
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo emitir la factura');
    } finally {
      setEmitiendo(null);
    }
  }

  function exportarCSV() {
    const filas = [['numero', 'fecha', 'cliente', 'total', 'estado']];
    facturas.forEach((f) =>
      filas.push([f.numero, new Date(f.fecha).toLocaleDateString('es-ES'), `${f.paciente.nombre} ${f.paciente.apellidos}`, String(f.total), f.conciliada ? 'conciliada' : 'cobrada']),
    );
    const csv = filas.map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `facturas_powerdent_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (cargando || !clinica) return <p className="mini">Cargando…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Facturación</h1>
          <p>Serie propia, numeración correlativa y facturas desde cobros</p>
        </div>
        <div className="acciones">
          <button className="btn gh" onClick={exportarCSV} disabled={facturas.length === 0}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Facturado {anio}</span>
          <b>{eur(facturadoAnual)}</b>
        </div>
        <div className="kpi">
          <span>Facturas emitidas</span>
          <b>{facturas.length}</b>
        </div>
        <div className="kpi">
          <span>Cobros sin facturar</span>
          <b style={{ color: sinFacturar.length ? 'var(--ambar)' : 'inherit' }}>{sinFacturar.length}</b>
        </div>
        <div className="kpi">
          <span>Sin conciliar</span>
          <b>{sinConciliar}</b>
        </div>
      </div>

      {error && (
        <p className="mini" style={{ color: 'var(--rojo)', marginBottom: 10 }}>
          {error}
        </p>
      )}

      {sinFacturar.length > 0 && (
        <div className="card">
          <h3>Cobros pendientes de factura</h3>
          <hr />
          <table>
            <tbody>
              {sinFacturar.slice(0, 15).map((c) => (
                <tr key={c.id}>
                  <td className="mini" style={{ width: 96 }}>
                    {new Date(c.fecha).toLocaleDateString('es-ES')}
                  </td>
                  <td>
                    <b>
                      {c.paciente.nombre} {c.paciente.apellidos}
                    </b>
                    <div className="mini">
                      {c.concepto || ''} · {c.forma}
                    </div>
                  </td>
                  <td className="num">{eur(c.importe)}</td>
                  <td className="num">
                    <button className="btn pri sm" disabled={emitiendo === c.id} onClick={() => emitir(c.id)}>
                      {emitiendo === c.id ? 'Emitiendo…' : 'Emitir factura'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Facturas emitidas</h3>
        <hr />
        {facturas.length === 0 ? (
          <div className="vacio">Aún no has emitido facturas.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th className="num">Total</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.numero}</td>
                  <td className="mini">{new Date(f.fecha).toLocaleDateString('es-ES')}</td>
                  <td>
                    {f.paciente.nombre} {f.paciente.apellidos}
                  </td>
                  <td className="num">{eur(f.total)}</td>
                  <td>{f.conciliada ? <span className="tag ok">conciliada</span> : <span className="tag info">cobrada</span>}</td>
                  <td className="num">
                    <button className="btn gh sm" onClick={() => setViendo(f)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {viendo && (
        <Modal onClose={() => setViendo(null)} ancho={720}>
          <FacturaDocumento clinica={clinica} factura={viendo} columnas={clinica.facturaColumnas} pie={clinica.facturaPie} />
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn gh" onClick={() => setViendo(null)}>
              Cerrar
            </button>
            <button className="btn pri" onClick={() => window.print()}>
              Imprimir / Guardar PDF
            </button>
          </div>
        </Modal>
      )}

      {viendo &&
        createPortal(
          <div id="print">
            <FacturaDocumento clinica={clinica} factura={viendo} columnas={clinica.facturaColumnas} pie={clinica.facturaPie} />
          </div>,
          document.body,
        )}
    </div>
  );
}
