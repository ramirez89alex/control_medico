import { CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';

interface Gabinete {
  id: string;
  nombre: string;
}

interface Dentista {
  id: string;
  nombre: string;
  rol: string;
  especialidad: string | null;
  colegiado: string | null;
  telefono: string | null;
  email: string | null;
  dni: string | null;
  fechaAlta: string | null;
  contrato: string | null;
  horasSemana: number;
  color: string;
  activo: boolean;
  notas: string | null;
  dias: number[];
  calendario: Record<string, string>;
  gabineteId: string | null;
  gabinete: Gabinete | null;
  pacientesAsignados: number;
}

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  doctorId: string | null;
}

interface Cita {
  id: string;
  fecha: string;
  hora: string;
  duracionMin: number;
  motivo: string | null;
  paciente: { id: string; nombre: string; apellidos: string } | null;
  nombreLibre: string | null;
  dentistaId: string | null;
}

const ESTADOS_TRAB: Record<string, [string, string]> = {
  trabaja: ['Trabaja', '#3FD98C'],
  libre: ['Libre', '#E2E5EC'],
  vac: ['Vacaciones', '#3B4076'],
  baja: ['Ausente', '#C9433F'],
};
const ORDEN = ['trabaja', 'libre', 'vac', 'baja'];
const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0];
const CONTRATOS = ['Indefinido', 'Temporal', 'Autónomo', 'Prácticas', 'Sustitución'];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function mesDe(fecha: string) {
  return fecha.slice(0, 7);
}

function diasDelMes(m: string): string[] {
  const [y, mm] = m.split('-').map(Number);
  const n = new Date(y, mm, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= n; d++) out.push(`${m}-${String(d).padStart(2, '0')}`);
  return out;
}

function estadoDia(d: Dentista, fecha: string): string {
  if (d.calendario?.[fecha]) return d.calendario[fecha];
  const dow = new Date(`${fecha}T00:00:00`).getDay();
  return d.dias.includes(dow) ? 'trabaja' : 'libre';
}

function minutosDe(hora: string) {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

function seSolapan(c: Cita, hora: string, dur: number) {
  const i = minutosDe(c.hora);
  const j = minutosDe(hora);
  return j < i + (c.duracionMin || 30) && i < j + (dur || 30);
}

export function Equipo() {
  const [dentistas, setDentistas] = useState<Dentista[]>([]);
  const [gabinetes, setGabinetes] = useState<Gabinete[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [mes, setMes] = useState(mesDe(hoyISO()));
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Dentista | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [planB, setPlanB] = useState<{ dentista: Dentista; fecha: string } | null>(null);

  const dias = useMemo(() => diasDelMes(mes), [mes]);

  async function cargar() {
    setCargando(true);
    const desde = `${mes}-01`;
    const hasta = dias[dias.length - 1] || desde;
    const [d, g, c] = await Promise.all([
      api.get<Dentista[]>('/equipo'),
      api.get<Gabinete[]>('/catalogos/gabinetes'),
      api.get<Cita[]>(`/citas?desde=${desde}&hasta=${hasta}`),
    ]);
    setDentistas(d);
    setGabinetes(g);
    setCitas(c);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  useEffect(() => {
    api.get<Paciente[]>('/pacientes').then(setPacientes);
  }, []);

  const activos = dentistas.filter((d) => d.activo);
  const trabajanHoy = activos.filter((d) => estadoDia(d, hoyISO()) === 'trabaja');

  const ausencias = dentistas
    .flatMap((d) => dias.filter((f) => f >= hoyISO() && estadoDia(d, f) !== 'trabaja' && d.calendario?.[f] && ['vac', 'baja'].includes(d.calendario[f])).map((f) => ({ dentista: d, fecha: f })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  function citasDe(dentistaId: string, fecha: string) {
    return citas.filter((c) => c.dentistaId === dentistaId && c.fecha === fecha);
  }

  const citasARecolocar = ausencias.reduce((a, x) => a + citasDe(x.dentista.id, x.fecha).length, 0);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post('/equipo', { nombre: form.get('nombre'), especialidad: form.get('especialidad') || undefined, color: form.get('color') });
    setAltaAbierta(false);
    cargar();
  }

  async function ciclarDia(id: string, fecha: string) {
    await api.post(`/equipo/${id}/dia`, { fecha });
    cargar();
  }

  function libresEsaFranja(fecha: string, hora: string, dur: number, excluirId: string) {
    return activos.filter(
      (d) => d.id !== excluirId && estadoDia(d, fecha) === 'trabaja' && !citas.some((c) => c.dentistaId === d.id && c.fecha === fecha && seSolapan(c, hora, dur)),
    );
  }

  async function reasignar(citaId: string, dentistaId: string) {
    await api.put(`/citas/${citaId}`, { dentistaId });
    cargar();
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Equipo y turnos</h1>
          <p>Fichas del personal y cuadrante del mes</p>
        </div>
        <div className="acciones">
          <button className="btn pri" onClick={() => setAltaAbierta(true)}>
            Añadir persona
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Personas</span>
          <b>{activos.length}</b>
        </div>
        <div className="kpi">
          <span>Trabajan hoy</span>
          <b>{trabajanHoy.length}</b>
        </div>
        <div className="kpi">
          <span>Ausencias previstas</span>
          <b style={{ color: ausencias.length ? 'var(--ambar)' : 'inherit' }}>{ausencias.length}</b>
        </div>
        <div className="kpi">
          <span>Citas a recolocar</span>
          <b style={{ color: citasARecolocar ? 'var(--marca)' : 'inherit' }}>{citasARecolocar}</b>
        </div>
      </div>

      {ausencias.length > 0 && (
        <div className="card" style={{ borderColor: '#EBC7C4', background: '#FDF7F6' }}>
          <h3>Plan de ausencias</h3>
          <hr />
          <table>
            <tbody>
              {ausencias.slice(0, 10).map((a) => {
                const n = citasDe(a.dentista.id, a.fecha).length;
                return (
                  <tr key={`${a.dentista.id}-${a.fecha}`}>
                    <td style={{ width: 12 }}>
                      <span style={{ display: 'block', width: 10, height: 10, borderRadius: 99, background: a.dentista.color }} />
                    </td>
                    <td>
                      <b>{a.dentista.nombre}</b>
                      <div className="mini">
                        {ESTADOS_TRAB[a.dentista.calendario[a.fecha]]?.[0]} · {new Date(`${a.fecha}T00:00:00`).toLocaleDateString('es-ES')}
                      </div>
                    </td>
                    <td>{n ? <span className="tag bad">{n} citas afectadas</span> : <span className="tag ok">sin citas</span>}</td>
                    <td className="num">
                      {n > 0 && (
                        <button className="btn pri sm" onClick={() => setPlanB({ dentista: a.dentista, fecha: a.fecha })}>
                          Resolver
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="entre">
          <h3>Cuadrante · {new Date(`${mes}-01T00:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</h3>
          <div className="fila">
            <button
              className="btn gh sm"
              onClick={() => {
                const d = new Date(`${mes}-01T00:00:00`);
                d.setMonth(d.getMonth() - 1);
                setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }}
            >
              ←
            </button>
            <button className="btn gh sm" onClick={() => setMes(mesDe(hoyISO()))}>
              Este mes
            </button>
            <button
              className="btn gh sm"
              onClick={() => {
                const d = new Date(`${mes}-01T00:00:00`);
                d.setMonth(d.getMonth() + 1);
                setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }}
            >
              →
            </button>
          </div>
        </div>
        <p className="mini">Toca un día para cambiarlo: trabaja → libre → vacaciones → ausente.</p>
        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : (
          <div className="cuadwrap">
            <table className="cuad">
              <thead>
                <tr>
                  <th className="nomcol">Persona</th>
                  {dias.map((f) => {
                    const d = new Date(`${f}T00:00:00`);
                    return (
                      <th key={f} className={[0, 6].includes(d.getDay()) ? 'finde' : ''}>
                        {d.getDate()}
                        <small>{DIAS_ES[d.getDay()].slice(0, 2)}</small>
                      </th>
                    );
                  })}
                  <th className="num">Días</th>
                </tr>
              </thead>
              <tbody>
                {activos.map((d) => {
                  const trabajados = dias.filter((f) => estadoDia(d, f) === 'trabaja').length;
                  return (
                    <tr key={d.id}>
                      <td className="nomcol" onClick={() => setEditando(d)} style={{ cursor: 'pointer' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: d.color, marginRight: 6 }} />
                        <b>{d.nombre}</b>
                        <div className="mini">{d.rol}</div>
                      </td>
                      {dias.map((f) => {
                        const e = estadoDia(d, f);
                        return (
                          <td key={f} className="cq" title={`${d.nombre} · ${f} · ${ESTADOS_TRAB[e][0]}`} onClick={() => ciclarDia(d.id, f)}>
                            <i style={{ background: ESTADOS_TRAB[e][1] }} />
                          </td>
                        );
                      })}
                      <td className="num">
                        <b>{trabajados}</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="calleg" style={{ marginTop: 10 }}>
          {Object.values(ESTADOS_TRAB).map(([n, c]) => (
            <span key={n}>
              <i style={{ background: c }} />
              {n}
            </span>
          ))}
        </div>
      </div>

      <div className="grid g2">
        {dentistas.map((d) => (
          <div className={`card ficha ${!d.activo ? 'off' : ''}`} style={{ '--c': d.color } as CSSProperties} key={d.id}>
            <div className="entre">
              <div>
                <h3>{d.nombre}</h3>
                <span className="mini">{d.especialidad || d.rol}</span>
              </div>
              <button className="btn gh sm" onClick={() => setEditando(d)}>
                Ficha
              </button>
            </div>
            <hr />
            <div className="mini">
              {d.telefono ? `Tel. ${d.telefono}` : 'sin teléfono'}
              {d.email ? ` · ${d.email}` : ''}
            </div>
            <div className="mini">
              {d.contrato || 'contrato sin definir'}
              {d.horasSemana ? ` · ${d.horasSemana} h/semana` : ''}
              {d.fechaAlta ? ` · desde ${new Date(d.fechaAlta).toLocaleDateString('es-ES')}` : ''}
            </div>
            <div className="mini">
              {d.gabinete ? (
                <>
                  Gabinete: <b>{d.gabinete.nombre}</b>
                </>
              ) : (
                'Sin gabinete fijo'
              )}{' '}
              · {d.pacientesAsignados} pacientes asignados
            </div>
            <div className="fila" style={{ marginTop: 8 }}>
              {DIAS_ORDEN.map((dow) => (
                <span key={dow} className={`tag ${d.dias.includes(dow) ? 'info' : ''}`} style={{ opacity: d.dias.includes(dow) ? 1 : 0.4 }}>
                  {DIAS_ES[dow].slice(0, 2)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {altaAbierta && (
        <Modal onClose={() => setAltaAbierta(false)}>
          <h2>Nuevo profesional</h2>
          <form onSubmit={crear}>
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div className="f">
                <label>Nombre</label>
                <input name="nombre" placeholder="Doctora …" required />
              </div>
              <div className="f">
                <label>Especialidad</label>
                <input name="especialidad" placeholder="Ortodoncia, cirugía, higiene…" />
              </div>
            </div>
            <div className="f" style={{ maxWidth: 120 }}>
              <label>Color en agenda</label>
              <input type="color" name="color" defaultValue="#C9433F" style={{ height: 38, padding: 3 }} />
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="btn gh" type="button" onClick={() => setAltaAbierta(false)}>
                Cancelar
              </button>
              <button className="btn pri" type="submit">
                Añadir
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editando && (
        <FichaModal
          dentista={editando}
          gabinetes={gabinetes}
          pacientes={pacientes}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}

      {planB && (
        <Modal onClose={() => setPlanB(null)}>
          <h2>
            Plan B · {planB.dentista.nombre} no viene el {new Date(`${planB.fecha}T00:00:00`).toLocaleDateString('es-ES')}
          </h2>
          <p className="mini">Reasigna sus citas de ese día a otro profesional libre esa franja.</p>
          <table style={{ marginTop: 12 }}>
            <tbody>
              {citasDe(planB.dentista.id, planB.fecha).map((c) => {
                const libres = libresEsaFranja(planB.fecha, c.hora, c.duracionMin, planB.dentista.id);
                return (
                  <tr key={c.id}>
                    <td className="mono" style={{ width: 52 }}>
                      {c.hora}
                    </td>
                    <td>
                      <b>{c.paciente ? `${c.paciente.nombre} ${c.paciente.apellidos}` : c.nombreLibre || 'Paciente'}</b>
                      <div className="mini">{c.motivo || ''}</div>
                    </td>
                    <td style={{ width: 190 }}>
                      {libres.length ? (
                        <select id={`pl_${c.id}`} style={{ width: '100%' }}>
                          {libres.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="tag warn">nadie libre</span>
                      )}
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {libres.length > 0 && (
                        <button
                          className="btn gh sm"
                          onClick={() => {
                            const sel = document.getElementById(`pl_${c.id}`) as HTMLSelectElement;
                            reasignar(c.id, sel.value);
                          }}
                        >
                          Pasar a
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {citasDe(planB.dentista.id, planB.fecha).length === 0 && (
                <tr>
                  <td className="mini">Sin citas ese día.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn gh" onClick={() => setPlanB(null)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FichaModal({
  dentista,
  gabinetes,
  pacientes,
  onClose,
  onGuardado,
}: {
  dentista: Dentista;
  gabinetes: Gabinete[];
  pacientes: Paciente[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [asignados, setAsignados] = useState(pacientes.filter((p) => p.doctorId === dentista.id));
  const [pacienteSel, setPacienteSel] = useState('');

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const dias = DIAS_ORDEN.filter((d) => form.get(`dia${d}`));
    await api.put(`/equipo/${dentista.id}`, {
      nombre: form.get('nombre'),
      rol: form.get('rol') || 'Odontólogo',
      especialidad: form.get('especialidad') || undefined,
      colegiado: form.get('colegiado') || undefined,
      telefono: form.get('telefono') || undefined,
      email: form.get('email') || undefined,
      dni: form.get('dni') || undefined,
      fechaAlta: form.get('fechaAlta') ? new Date(`${form.get('fechaAlta')}T00:00:00`).toISOString() : undefined,
      contrato: form.get('contrato') || undefined,
      horasSemana: Number(form.get('horasSemana')) || 40,
      color: form.get('color'),
      activo: form.get('activo') === 'si',
      notas: form.get('notas') || undefined,
      gabineteId: form.get('gabineteId') || undefined,
      dias,
    });
    onGuardado();
  }

  async function asignar() {
    if (!pacienteSel) return;
    await api.put(`/pacientes/${pacienteSel}`, { doctorId: dentista.id });
    const p = pacientes.find((x) => x.id === pacienteSel);
    if (p) setAsignados([...asignados, { ...p, doctorId: dentista.id }]);
    setPacienteSel('');
  }

  async function quitar(pid: string) {
    await api.put(`/pacientes/${pid}`, { doctorId: null });
    setAsignados(asignados.filter((p) => p.id !== pid));
  }

  return (
    <Modal onClose={onClose} ancho={720}>
      <h2>Ficha de {dentista.nombre}</h2>
      <form onSubmit={guardar}>
        <div className="grid g2" style={{ marginTop: 12 }}>
          <div className="f">
            <label>Nombre</label>
            <input name="nombre" defaultValue={dentista.nombre} required />
          </div>
          <div className="f">
            <label>Puesto</label>
            <input name="rol" defaultValue={dentista.rol} placeholder="Odontólogo, higienista, auxiliar, recepción" />
          </div>
          <div className="f">
            <label>Especialidad</label>
            <input name="especialidad" defaultValue={dentista.especialidad || ''} />
          </div>
          <div className="f">
            <label>Nº colegiado</label>
            <input name="colegiado" defaultValue={dentista.colegiado || ''} />
          </div>
          <div className="f">
            <label>Teléfono</label>
            <input name="telefono" defaultValue={dentista.telefono || ''} />
          </div>
          <div className="f">
            <label>Email</label>
            <input name="email" type="email" defaultValue={dentista.email || ''} />
          </div>
          <div className="f">
            <label>DNI / NIE</label>
            <input name="dni" defaultValue={dentista.dni || ''} />
          </div>
          <div className="f">
            <label>Fecha de alta</label>
            <input type="date" name="fechaAlta" defaultValue={dentista.fechaAlta ? dentista.fechaAlta.slice(0, 10) : ''} />
          </div>
          <div className="f">
            <label>Contrato</label>
            <select name="contrato" defaultValue={dentista.contrato || CONTRATOS[0]}>
              {CONTRATOS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Horas por semana</label>
            <input type="number" name="horasSemana" defaultValue={dentista.horasSemana || 40} />
          </div>
        </div>
        <label>Días que viene a trabajar</label>
        <div className="fila" style={{ marginBottom: 12 }}>
          {DIAS_ORDEN.map((d) => (
            <label className="chip" key={d}>
              <input type="checkbox" name={`dia${d}`} defaultChecked={dentista.dias.includes(d)} /> {DIAS_ES[d]}
            </label>
          ))}
        </div>
        <div className="grid g2">
          <div className="f">
            <label>Gabinete habitual</label>
            <select name="gabineteId" defaultValue={dentista.gabineteId || ''}>
              <option value="">— sin fijar —</option>
              {gabinetes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Color en la agenda</label>
            <input type="color" name="color" defaultValue={dentista.color} style={{ height: 38, padding: 3 }} />
          </div>
          <div className="f">
            <label>En activo</label>
            <select name="activo" defaultValue={dentista.activo ? 'si' : 'no'}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div className="f">
          <label>Notas</label>
          <textarea name="notas" defaultValue={dentista.notas || ''} placeholder="Vacaciones pactadas, formación, observaciones…" />
        </div>
        <hr />
        <div className="entre">
          <label style={{ margin: 0 }}>Pacientes asignados</label>
          <span className="mini">{asignados.length} pacientes</span>
        </div>
        <div className="fila" style={{ margin: '8px 0' }}>
          <select value={pacienteSel} onChange={(e) => setPacienteSel(e.target.value)} style={{ maxWidth: 280 }}>
            <option value="">— elegir paciente —</option>
            {pacientes
              .filter((p) => p.doctorId !== dentista.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos}
                </option>
              ))}
          </select>
          <button className="btn pri sm" type="button" onClick={asignar}>
            Asignar
          </button>
        </div>
        <div className="asig">
          {asignados.length ? (
            asignados.map((p) => (
              <span className="tag info" key={p.id}>
                {p.nombre} {p.apellidos}
                <b onClick={() => quitar(p.id)} style={{ cursor: 'pointer', marginLeft: 5 }}>
                  ×
                </b>
              </span>
            ))
          ) : (
            <span className="mini">Ninguno asignado todavía.</span>
          )}
        </div>
        <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn gh" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn pri" type="submit">
            Guardar ficha
          </button>
        </div>
      </form>
    </Modal>
  );
}
