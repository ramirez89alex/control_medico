import type { ClinicaLegal } from '../lib/legal';
import { DocCabecera } from './DocCabecera';

interface LineaFactura {
  nombre: string;
  cantidad: number;
  pvp: number;
}

interface FacturaDoc {
  numero: string;
  fecha: string;
  paciente: { nombre: string; apellidos: string; dni: string | null; direccion: string | null };
  lineas: LineaFactura[];
  total: number;
  exenta: boolean;
  iva: number;
}

export type ColumnaFactura = 'concepto' | 'cantidad' | 'precio' | 'importe';

export const COLUMNAS_FACTURA: Record<ColumnaFactura, string> = {
  concepto: 'Concepto',
  cantidad: 'Ud.',
  precio: 'Precio',
  importe: 'Importe',
};

const COLUMNAS_POR_DEFECTO: ColumnaFactura[] = ['concepto', 'cantidad', 'precio', 'importe'];

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function celda(col: ColumnaFactura, l: LineaFactura): string {
  if (col === 'concepto') return l.nombre;
  if (col === 'cantidad') return String(l.cantidad);
  if (col === 'precio') return eur(l.pvp);
  return eur(l.pvp * l.cantidad);
}

interface Props {
  clinica: ClinicaLegal;
  factura: FacturaDoc;
  columnas?: ColumnaFactura[];
  pie?: string | null;
}

export function FacturaDocumento({ clinica, factura, columnas, pie }: Props) {
  const cols = columnas && columnas.length === 4 ? columnas : COLUMNAS_POR_DEFECTO;
  const piePersonalizado = pie?.trim() ? pie.replace('{numero}', factura.numero).replace('{nombre}', clinica.nombre) : null;

  return (
    <div className="doc">
      <DocCabecera clinica={clinica} />

      <h3>Factura {factura.numero}</h3>
      <p style={{ fontSize: 12 }}>
        Cliente: <b>{factura.paciente.nombre} {factura.paciente.apellidos}</b>
        {factura.paciente.dni ? ` · ${factura.paciente.dni}` : ''}
        {factura.paciente.direccion && (
          <>
            <br />
            {factura.paciente.direccion}
          </>
        )}
        <br />
        Fecha: {new Date(factura.fecha).toLocaleDateString('es-ES')}
      </p>

      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className={c === 'concepto' ? undefined : 'num'}>
                {COLUMNAS_FACTURA[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factura.lineas.map((l, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className={c === 'concepto' ? undefined : 'num'}>
                  {celda(c, l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tot">Total: {eur(factura.total)}</div>

      <p style={{ fontSize: 11, marginTop: 12 }}>
        {factura.exenta
          ? 'Operación exenta de IVA por aplicación del art. 20.1.3º de la Ley 37/1992 (asistencia sanitaria).'
          : `IVA ${factura.iva}% incluido.`}
      </p>

      <div className="pie">
        {piePersonalizado || (
          <>
            {clinica.nombre}
            {clinica.nif ? ` · NIF ${clinica.nif}` : ''} · Factura {factura.numero}
          </>
        )}
      </div>
    </div>
  );
}
