import { useEffect, useMemo, useState } from 'react';
import { financiacion } from '@powerdent/shared';
import { api } from '../lib/api';
import { subirArchivo } from '../lib/archivos';
import { COLUMNAS_FACTURA, type ColumnaFactura } from '../components/FacturaDocumento';

interface Clinica {
  nombre: string;
  titular: string | null;
  nif: string | null;
  direccion: string | null;
  cp: string | null;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  colegiado: string | null;
  dpd: string | null;
  iva: number;
  finCuotas: number;
  finTIN: number;
  serie: string;
  logoArchivoId: string | null;
  logoUrl: string | null;
  facturaPie: string | null;
  facturaColumnas: ColumnaFactura[];
  banco: string | null;
  pasarela: string | null;
  iban: string | null;
}

interface Gabinete {
  id: string;
  nombre: string;
  uso: string | null;
}

interface ItemTarifario {
  id: string;
  codigo: string;
  nombre: string;
  familia: string | null;
  pvp: number;
  coste: number;
  minutos: number | null;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function Ajustes() {
  const [clinica, setClinica] = useState<Clinica | null>(null);
  const [gabinetes, setGabinetes] = useState<Gabinete[]>([]);
  const [tarifario, setTarifario] = useState<ItemTarifario[]>([]);
  const [q, setQ] = useState('');
  const [familia, setFamilia] = useState('');
  const [subiendoLogo, setSubiendoLogo] = useState(false);

  useEffect(() => {
    api.get<Clinica>('/catalogos/clinica').then(setClinica);
    api.get<Gabinete[]>('/catalogos/gabinetes').then(setGabinetes);
    api.get<ItemTarifario[]>('/catalogos/tarifario').then(setTarifario);
  }, []);

  async function guardarClinica<K extends keyof Clinica>(campo: K, valor: Clinica[K]) {
    setClinica((c) => (c ? { ...c, [campo]: valor } : c));
    await api.put('/catalogos/clinica', { [campo]: valor });
  }

  async function guardarGabinete(id: string, campo: 'nombre' | 'uso', valor: string) {
    setGabinetes((gs) => gs.map((g) => (g.id === id ? { ...g, [campo]: valor } : g)));
    await api.put(`/catalogos/gabinetes/${id}`, { [campo]: valor });
  }

  async function anadirGabinete() {
    const nuevo = await api.post<Gabinete>('/catalogos/gabinetes', { nombre: 'Nuevo gabinete', uso: '' });
    setGabinetes((gs) => [...gs, nuevo]);
  }

  async function borrarGabinete(id: string) {
    if (!confirm('¿Eliminar este gabinete?')) return;
    try {
      await api.del(`/catalogos/gabinetes/${id}`);
      setGabinetes((gs) => gs.filter((g) => g.id !== id));
    } catch {
      alert('No se puede eliminar: tiene citas o profesionales asignados.');
    }
  }

  async function guardarTarifa(id: string, campo: keyof ItemTarifario, valor: string | number) {
    setTarifario((ts) => ts.map((t) => (t.id === id ? { ...t, [campo]: valor } : t)));
    await api.put(`/catalogos/tarifario/${id}`, { [campo]: valor });
  }

  async function anadirTarifa() {
    const nueva = await api.post<ItemTarifario>('/catalogos/tarifario', {
      codigo: '',
      nombre: 'Nuevo tratamiento',
      familia: familia || 'Otros',
      pvp: 0,
      coste: 0,
    });
    setTarifario((ts) => [nueva, ...ts]);
  }

  async function borrarTarifa(id: string) {
    if (!confirm('¿Eliminar este código del tarifario?')) return;
    await api.del(`/catalogos/tarifario/${id}`);
    setTarifario((ts) => ts.filter((t) => t.id !== id));
  }

  async function subirLogo(file: File) {
    setSubiendoLogo(true);
    try {
      const archivo = await subirArchivo(file, file.name);
      const actualizada = await api.put<Clinica>('/catalogos/clinica', { logoArchivoId: archivo.id });
      setClinica(actualizada);
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function quitarLogo() {
    const actualizada = await api.put<Clinica>('/catalogos/clinica', { logoArchivoId: null });
    setClinica(actualizada);
  }

  async function moverColumna(indice: number, direccion: -1 | 1) {
    if (!clinica) return;
    const destino = indice + direccion;
    if (destino < 0 || destino >= clinica.facturaColumnas.length) return;
    const columnas = [...clinica.facturaColumnas];
    [columnas[indice], columnas[destino]] = [columnas[destino], columnas[indice]];
    setClinica({ ...clinica, facturaColumnas: columnas });
    await api.put('/catalogos/clinica', { facturaColumnas: columnas });
  }

  const familias = useMemo(() => [...new Set(tarifario.map((t) => t.familia || 'Otros'))].sort(), [tarifario]);
  const listaTarifario = useMemo(
    () =>
      tarifario.filter(
        (t) => (!familia || (t.familia || 'Otros') === familia) && (!q || `${t.codigo} ${t.nombre}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [tarifario, q, familia],
  );

  if (!clinica) return <p className="mini">Cargando…</p>;

  const ejemplo = financiacion(1000, clinica.finCuotas, clinica.finTIN);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Ajustes</h1>
          <p>Datos de la clínica, financiación y tarifario</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Datos de la clínica</h3>
          <hr />
          <div className="grid g2">
            <div className="f">
              <label>Nombre comercial</label>
              <input defaultValue={clinica.nombre} onBlur={(e) => guardarClinica('nombre', e.target.value)} />
            </div>
            <div className="f">
              <label>Titular / dirección clínica</label>
              <input defaultValue={clinica.titular || ''} onBlur={(e) => guardarClinica('titular', e.target.value)} />
            </div>
            <div className="f">
              <label>NIF</label>
              <input defaultValue={clinica.nif || ''} onBlur={(e) => guardarClinica('nif', e.target.value)} />
            </div>
            <div className="f">
              <label>Nº colegiado</label>
              <input defaultValue={clinica.colegiado || ''} onBlur={(e) => guardarClinica('colegiado', e.target.value)} />
            </div>
            <div className="f">
              <label>Teléfono</label>
              <input defaultValue={clinica.telefono || ''} onBlur={(e) => guardarClinica('telefono', e.target.value)} />
            </div>
            <div className="f">
              <label>Email</label>
              <input defaultValue={clinica.email || ''} onBlur={(e) => guardarClinica('email', e.target.value)} />
            </div>
            <div className="f">
              <label>Dirección</label>
              <input defaultValue={clinica.direccion || ''} onBlur={(e) => guardarClinica('direccion', e.target.value)} />
            </div>
            <div className="f">
              <label>CP</label>
              <input defaultValue={clinica.cp || ''} onBlur={(e) => guardarClinica('cp', e.target.value)} />
            </div>
            <div className="f">
              <label>Ciudad</label>
              <input defaultValue={clinica.ciudad || ''} onBlur={(e) => guardarClinica('ciudad', e.target.value)} />
            </div>
            <div className="f">
              <label>Contacto protección de datos</label>
              <input defaultValue={clinica.dpd || ''} onBlur={(e) => guardarClinica('dpd', e.target.value)} />
            </div>
          </div>
          <div className="grid g2">
            <div className="f">
              <label>IVA aplicado (%) — sanidad exenta habitualmente</label>
              <input type="number" defaultValue={clinica.iva} onBlur={(e) => guardarClinica('iva', Number(e.target.value) || 0)} />
            </div>
            <div className="f">
              <label>Serie de facturación</label>
              <input
                maxLength={4}
                defaultValue={clinica.serie}
                onBlur={(e) => guardarClinica('serie', e.target.value || 'F')}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Financiación y cobro</h3>
          <hr />
          <div className="grid g2">
            <div className="f">
              <label>Nº de cuotas</label>
              <input type="number" defaultValue={clinica.finCuotas} onBlur={(e) => guardarClinica('finCuotas', Number(e.target.value) || 12)} />
            </div>
            <div className="f">
              <label>Interés TIN anual (%)</label>
              <input
                type="number"
                step="0.1"
                defaultValue={clinica.finTIN}
                onBlur={(e) => guardarClinica('finTIN', Number(e.target.value) || 0)}
              />
            </div>
            <div className="f">
              <label>Web de tu banco</label>
              <input
                placeholder="https://empresas.bancosabadell.com"
                defaultValue={clinica.banco || ''}
                onBlur={(e) => guardarClinica('banco', e.target.value)}
              />
            </div>
            <div className="f">
              <label>Enlace de pasarela / TPV virtual</label>
              <input
                placeholder="https://buy.stripe.com/xxx"
                defaultValue={clinica.pasarela || ''}
                onBlur={(e) => guardarClinica('pasarela', e.target.value)}
              />
            </div>
            <div className="f">
              <label>IBAN o Bizum de la clínica</label>
              <input defaultValue={clinica.iban || ''} onBlur={(e) => guardarClinica('iban', e.target.value)} />
            </div>
          </div>
          <div className="finbox">
            <b className="mini">Ejemplo sobre 1.000 €</b>
            <div>
              {ejemplo.n} × {eur(ejemplo.cuota)} = {eur(ejemplo.total)} (TAE {ejemplo.tae.toFixed(2).replace('.', ',')}%)
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Formato de factura</h3>
        <hr />
        <div className="grid g2">
          <div>
            <label>Logotipo</label>
            <div className="fila" style={{ alignItems: 'center', marginTop: 6 }}>
              {clinica.logoUrl && (
                <img src={clinica.logoUrl} alt="Logo" style={{ height: 44, border: '1px solid var(--linea)', borderRadius: 6, background: '#fff', padding: 4 }} />
              )}
              <label className="btn gh sm" style={{ textTransform: 'none', letterSpacing: 0, cursor: 'pointer' }}>
                {subiendoLogo ? 'Subiendo…' : clinica.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={subiendoLogo}
                  onChange={(e) => e.target.files?.[0] && subirLogo(e.target.files[0])}
                />
              </label>
              {clinica.logoUrl && (
                <button className="btn gh sm" onClick={quitarLogo}>
                  Quitar
                </button>
              )}
            </div>
            <p className="mini" style={{ marginTop: 6 }}>
              Aparece en la cabecera de facturas y del consentimiento firmado.
            </p>
          </div>
          <div className="f">
            <label>Pie de página de la factura</label>
            <textarea
              placeholder={`Por defecto: ${clinica.nombre} · NIF · Factura {numero}`}
              defaultValue={clinica.facturaPie || ''}
              onBlur={(e) => guardarClinica('facturaPie', e.target.value)}
            />
            <p className="mini">Puedes usar {'{numero}'} y {'{nombre}'}; déjalo vacío para el pie por defecto.</p>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label>Orden de columnas de la tabla</label>
          <div className="fila" style={{ flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {clinica.facturaColumnas.map((col, i) => (
              <span key={col} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {COLUMNAS_FACTURA[col]}
                <button
                  className="btn gh sm"
                  style={{ padding: '0 6px' }}
                  disabled={i === 0}
                  onClick={() => moverColumna(i, -1)}
                  title="Mover a la izquierda"
                >
                  ←
                </button>
                <button
                  className="btn gh sm"
                  style={{ padding: '0 6px' }}
                  disabled={i === clinica.facturaColumnas.length - 1}
                  onClick={() => moverColumna(i, 1)}
                  title="Mover a la derecha"
                >
                  →
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="entre">
          <h3>Gabinetes y salas</h3>
          <button className="btn pri sm" onClick={anadirGabinete}>
            Añadir
          </button>
        </div>
        <hr />
        {gabinetes.length === 0 ? (
          <div className="vacio">Sin gabinetes.</div>
        ) : (
          <table>
            <tbody>
              {gabinetes.map((g) => (
                <tr key={g.id}>
                  <td>
                    <input defaultValue={g.nombre} onBlur={(e) => guardarGabinete(g.id, 'nombre', e.target.value)} />
                  </td>
                  <td>
                    <input
                      placeholder="Uso / equipamiento"
                      defaultValue={g.uso || ''}
                      onBlur={(e) => guardarGabinete(g.id, 'uso', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <button className="btn gh sm" onClick={() => borrarGabinete(g.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="entre">
          <h3>Tarifario · {tarifario.length} códigos</h3>
          <button className="btn pri sm" onClick={anadirTarifa}>
            Añadir código
          </button>
        </div>
        <div className="fila" style={{ margin: '12px 0' }}>
          <input placeholder="Buscar código o tratamiento…" style={{ maxWidth: 300 }} value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ maxWidth: 200 }} value={familia} onChange={(e) => setFamilia(e.target.value)}>
            <option value="">Todas las familias</option>
            {familias.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <span className="mini">{listaTarifario.length} resultados</span>
        </div>
        <div style={{ maxHeight: 520, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tratamiento</th>
                <th>Familia</th>
                <th className="num">PVP</th>
                <th className="num">Coste</th>
                <th className="num">Margen</th>
                <th className="num">Min.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listaTarifario.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input
                      style={{ width: 92, fontFamily: "'IBM Plex Mono'", fontSize: 12.5 }}
                      defaultValue={t.codigo}
                      onBlur={(e) => guardarTarifa(t.id, 'codigo', e.target.value)}
                    />
                  </td>
                  <td>
                    <input defaultValue={t.nombre} onBlur={(e) => guardarTarifa(t.id, 'nombre', e.target.value)} />
                  </td>
                  <td>
                    <input style={{ width: 120 }} defaultValue={t.familia || ''} onBlur={(e) => guardarTarifa(t.id, 'familia', e.target.value)} />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 88 }}
                      defaultValue={t.pvp}
                      onBlur={(e) => guardarTarifa(t.id, 'pvp', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 88 }}
                      defaultValue={t.coste}
                      onBlur={(e) => guardarTarifa(t.id, 'coste', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td className="num">{t.pvp ? Math.round(((t.pvp - t.coste) / t.pvp) * 100) : 0}%</td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 66 }}
                      defaultValue={t.minutos ?? ''}
                      onBlur={(e) => guardarTarifa(t.id, 'minutos', Number(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <button className="btn gh sm" onClick={() => borrarTarifa(t.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
