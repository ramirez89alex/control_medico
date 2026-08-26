import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';

const TIPOS_LAB = [
  'Corona',
  'Puente',
  'Incrustación',
  'Carilla',
  'Placa de descarga',
  'Férula deportiva',
  'Alineadores / férulas',
  'Retenedor',
  'Prótesis parcial',
  'Prótesis completa',
  'Aparato de ortodoncia',
  'Cubeta individual',
  'Barra sobre implantes',
];

const FASES = ['Impresión enviada', 'Prueba en boca', 'Terminado en lab', 'Recibido en clínica', 'Colocado al paciente'];

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
}

interface Trabajo {
  id: string;
  paciente: Paciente;
  nombreLab: string | null;
  tipo: string;
  trabajo: string | null;
  piezas: string | null;
  material: string | null;
  fechaEnvio: string;
  fechaPrevista: string;
  fechaCita: string | null;
  coste: number;
  estado: 'enviado' | 'recibido' | 'entregado';
  fases: Record<string, string>;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const ES_PLACA = /placa|f[eé]rula|alineador|retenedor/i;

export function Laboratorio() {
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    setCargando(true);
    setTrabajos(await api.get<Trabajo[]>('/laboratorio'));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    api.get<Paciente[]>('/pacientes').then(setPacientes);
  }, []);

  const pend = trabajos.filter((t) => t.estado !== 'entregado');
  const tarde = pend.filter((t) => t.fechaPrevista.slice(0, 10) < hoyISO());
  const placas = pend.filter((t) => ES_PLACA.test(t.tipo));
  const costeEnCurso = pend.reduce((a, t) => a + t.coste, 0);
  const porTipo = pend.reduce<Record<string, number>>((acc, t) => {
    acc[t.tipo] = (acc[t.tipo] || 0) + 1;
    return acc;
  }, {});

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post('/laboratorio', {
      pacienteId: form.get('pacienteId'),
      nombreLab: form.get('nombreLab') || undefined,
      tipo: form.get('tipo'),
      trabajo: form.get('trabajo') || undefined,
      piezas: form.get('piezas') || undefined,
      material: form.get('material') || undefined,
      fechaEnvio: new Date(`${form.get('fechaEnvio')}T00:00:00`).toISOString(),
      diasEntrega: Number(form.get('diasEntrega')) || 7,
      coste: Number(form.get('coste')) || 0,
      fechaCita: form.get('fechaCita') ? new Date(`${form.get('fechaCita')}T00:00:00`).toISOString() : undefined,
    });
    setMostrarForm(false);
    cargar();
  }

  async function toggleFase(id: string, fase: string) {
    await api.post(`/laboratorio/${id}/fase`, { fase });
    cargar();
  }

  async function cambiarEstado(id: string, estado: string) {
    await api.put(`/laboratorio/${id}/estado`, { estado });
    cargar();
  }

  async function borrar(id: string) {
    await api.del(`/laboratorio/${id}`);
    cargar();
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Laboratorio y placas</h1>
          <p>Prótesis, férulas y alineadores: fases, plazos y coste</p>
        </div>
        <div className="acciones">
          <button className="btn pri" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : 'Nuevo trabajo'}
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>En curso</span>
          <b>{pend.length}</b>
        </div>
        <div className="kpi">
          <span>Placas y férulas</span>
          <b>{placas.length}</b>
        </div>
        <div className="kpi">
          <span>Fuera de plazo</span>
          <b style={{ color: tarde.length ? 'var(--rojo)' : 'inherit' }}>{tarde.length}</b>
        </div>
        <div className="kpi">
          <span>Coste en curso</span>
          <b>{eur(costeEnCurso)}</b>
        </div>
      </div>

      {Object.keys(porTipo).length > 0 && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="fila">
            {Object.entries(porTipo).map(([k, n]) => (
              <span className="tag info" key={k}>
                {k}: {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {mostrarForm && (
        <div className="card">
          <form onSubmit={crear}>
            <div className="grid g2">
              <div className="f">
                <label>Paciente</label>
                <select name="pacienteId" required>
                  <option value="">—</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.apellidos}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Laboratorio / protésico</label>
                <input name="nombreLab" placeholder="Nombre del laboratorio" />
              </div>
              <div className="f">
                <label>Tipo de trabajo</label>
                <select name="tipo" defaultValue={TIPOS_LAB[0]}>
                  {TIPOS_LAB.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Descripción</label>
                <input name="trabajo" placeholder="Zirconio A2 / placa superior 2 mm" />
              </div>
              <div className="f">
                <label>Piezas o arcada</label>
                <input name="piezas" placeholder="26 · superior · inferior" />
              </div>
              <div className="f">
                <label>Material / color</label>
                <input name="material" placeholder="Zirconio, PMMA, cromo-cobalto…" />
              </div>
              <div className="f">
                <label>Fecha de envío</label>
                <input type="date" name="fechaEnvio" defaultValue={hoyISO()} />
              </div>
              <div className="f">
                <label>Días de entrega</label>
                <input type="number" name="diasEntrega" defaultValue={7} />
              </div>
              <div className="f">
                <label>Coste laboratorio (€)</label>
                <input type="number" name="coste" step="0.01" defaultValue={0} />
              </div>
              <div className="f">
                <label>Cita de colocación prevista</label>
                <input type="date" name="fechaCita" />
              </div>
            </div>
            <button className="btn pri" type="submit">
              Guardar trabajo
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="entre" style={{ marginBottom: 10 }}>
          <h3>Trabajos</h3>
          <span className="mini">Toca los puntos para marcar fases: impresión, prueba, terminado, recibido, colocado</span>
        </div>
        <hr />
        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : trabajos.length === 0 ? (
          <div className="vacio">Sin trabajos de laboratorio.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Trabajo</th>
                <th>Laboratorio</th>
                <th>Fases</th>
                <th>Previsto</th>
                <th>Estado</th>
                <th className="num">Coste</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trabajos.map((t) => {
                const esTarde = t.estado !== 'entregado' && t.fechaPrevista.slice(0, 10) < hoyISO();
                // Postgres (jsonb) no conserva el orden de inserción de las claves, así que la
                // "última fase" se determina por el orden fijo de FASES, no por Object.keys().
                const ultimaFase = [...FASES].reverse().find((f) => t.fases?.[f]);
                return (
                  <tr key={t.id}>
                    <td>
                      <b>
                        {t.paciente.nombre} {t.paciente.apellidos}
                      </b>
                      {t.fechaCita && <div className="mini">coloca {new Date(t.fechaCita).toLocaleDateString('es-ES')}</div>}
                    </td>
                    <td>
                      <span className="tag info">{t.tipo}</span> {t.trabajo || ''}
                      <div className="mini">
                        {t.piezas || ''} {t.material ? `· ${t.material}` : ''}
                      </div>
                    </td>
                    <td className="mini">
                      {t.nombreLab || '—'}
                      <div>env. {new Date(t.fechaEnvio).toLocaleDateString('es-ES')}</div>
                    </td>
                    <td>
                      <div className="fases">
                        {FASES.map((f) => (
                          <span
                            key={f}
                            className={t.fases?.[f] ? 'ok' : ''}
                            title={f + (t.fases?.[f] ? ` · ${t.fases[f]}` : '')}
                            onClick={() => toggleFase(t.id, f)}
                          />
                        ))}
                      </div>
                      <div className="mini">{ultimaFase || 'sin fases'}</div>
                    </td>
                    <td className="mini" style={esTarde ? { color: 'var(--rojo)', fontWeight: 600 } : undefined}>
                      {new Date(t.fechaPrevista).toLocaleDateString('es-ES')}
                      {esTarde ? ' ⚠' : ''}
                    </td>
                    <td>
                      <select
                        className={{ enviado: 'tag info', recibido: 'tag warn', entregado: 'tag ok' }[t.estado]}
                        style={{ padding: '3px 6px', fontSize: 12, width: 'auto' }}
                        value={t.estado}
                        onChange={(e) => cambiarEstado(t.id, e.target.value)}
                      >
                        <option value="enviado">enviado</option>
                        <option value="recibido">recibido</option>
                        <option value="entregado">entregado</option>
                      </select>
                    </td>
                    <td className="num">{eur(t.coste)}</td>
                    <td>
                      <button className="btn gh sm" onClick={() => borrar(t.id)}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
