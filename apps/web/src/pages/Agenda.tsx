import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hoyISO, sumarDiasISO } from '@powerdent/shared';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/Modal';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  consentFirmaArchivoId: string | null;
}

interface Dentista {
  id: string;
  nombre: string;
  color: string;
  gabineteId: string | null;
}

interface Gabinete {
  id: string;
  nombre: string;
  uso: string | null;
}

interface Cita {
  id: string;
  fecha: string;
  hora: string;
  duracionMin: number;
  motivo: string | null;
  estado: string;
  confirmada: boolean;
  confirmPedida: string | null;
  paciente: Paciente | null;
  nombreLibre: string | null;
  dentista: Dentista | null;
  gabinete: Gabinete | null;
}

const TAG_ESTADO: Record<string, string> = {
  programada: 'tag info',
  llegado: 'tag warn',
  hecha: 'tag ok',
  cancelada: 'tag bad',
};

const DURACIONES = [15, 30, 45, 60, 90, 120];

// Horario visible del planning, igual que en la app original (8:00–21:00 en tramos de 30').
const H0 = 8;
const H1 = 21;


function telWA(tel: string) {
  const limpio = tel.replace(/[^\d]/g, '');
  return limpio.length === 9 ? `34${limpio}` : limpio;
}

function nombreCita(c: Cita) {
  return c.paciente ? `${c.paciente.nombre} ${c.paciente.apellidos}` : c.nombreLibre || 'Paciente';
}

function finCita(c: Cita) {
  const [hh, mm] = c.hora.split(':').map(Number);
  const fin = new Date(2000, 0, 1, hh, mm + (c.duracionMin || 30));
  return `${String(fin.getHours()).padStart(2, '0')}${String(fin.getMinutes()).padStart(2, '0')}00`;
}

/** Enlace de "añadir a Google Calendar" con los datos de la cita, sin necesitar OAuth. */
function gcalURL(c: Cita) {
  const ini = `${c.fecha.replace(/-/g, '')}T${c.hora.replace(':', '')}00`;
  const fin = `${c.fecha.replace(/-/g, '')}T${finCita(c)}`;
  const detalle = [c.dentista ? `Profesional: ${c.dentista.nombre}` : '', c.gabinete ? `Gabinete: ${c.gabinete.nombre}` : '', c.paciente?.telefono ? `Tel: ${c.paciente.telefono}` : '']
    .filter(Boolean)
    .join('\n');
  return (
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(`${nombreCita(c)} · ${c.motivo || 'Cita'}`)}` +
    `&dates=${ini}/${fin}&ctz=Europe/Madrid` +
    `&details=${encodeURIComponent(detalle)}`
  );
}

type TipoRecordatorio = 'semana' | '3dias' | '1dia' | '1hora';

interface RecordatorioPendiente {
  id: string;
  fecha: string;
  hora: string;
  motivo: string | null;
  paciente: { nombre: string; apellidos: string; telefono: string | null } | null;
  pacienteId: string | null;
  dentista: string | null;
  tipo: TipoRecordatorio;
}

const ETIQUETA_RECORDATORIO: Record<TipoRecordatorio, string> = {
  semana: '1 semana antes',
  '3dias': '3 días antes',
  '1dia': '1 día antes',
  '1hora': '1 hora antes',
};

function fraseRecordatorio(tipo: TipoRecordatorio, fechaHablada: string, hora: string) {
  switch (tipo) {
    case 'semana':
      return `Te recordamos que la semana que viene tienes cita el ${fechaHablada} a las ${hora}.`;
    case '3dias':
      return `Te recordamos tu cita en 3 días, el ${fechaHablada} a las ${hora}.`;
    case '1dia':
      return `Te recordamos que mañana tienes cita, el ${fechaHablada} a las ${hora}.`;
    case '1hora':
      return `Te recordamos que en 1 hora tienes cita hoy a las ${hora}.`;
  }
}

export function Agenda() {
  const navigate = useNavigate();
  const [fecha, setFecha] = useState(hoyISO());
  const [citas, setCitas] = useState<Cita[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [dentistas, setDentistas] = useState<Dentista[]>([]);
  const [gabinetes, setGabinetes] = useState<Gabinete[]>([]);
  const [huecos, setHuecos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalCita, setModalCita] = useState<Cita | 'nueva' | null>(null);
  const [recordatorios, setRecordatorios] = useState<Cita[]>([]);
  const [avisosPendientes, setAvisosPendientes] = useState<RecordatorioPendiente[]>([]);
  const [labVencido, setLabVencido] = useState(0);
  const [cobradoMes, setCobradoMes] = useState(0);

  async function cargar() {
    setCargando(true);
    const [c, h] = await Promise.all([
      api.get<Cita[]>(`/citas?desde=${fecha}&hasta=${fecha}`),
      api.get<{ libres: string[] }>(`/citas/huecos?fecha=${fecha}`),
    ]);
    setCitas(c);
    setHuecos(h.libres);
    setCargando(false);
  }

  async function cargarRecordatorios() {
    const desde = hoyISO();
    const hasta = sumarDiasISO(desde, 2);
    const c = await api.get<Cita[]>(`/citas?desde=${desde}&hasta=${hasta}`);
    setRecordatorios(c.filter((x) => x.estado !== 'hecha' && x.estado !== 'cancelada').sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)));
  }

  async function cargarAvisosPendientes() {
    setAvisosPendientes(await api.get<RecordatorioPendiente[]>('/citas/recordatorios-pendientes'));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  useEffect(() => {
    api.get<Paciente[]>('/pacientes').then(setPacientes);
    api.get<Dentista[]>('/catalogos/dentistas').then(setDentistas);
    api.get<Gabinete[]>('/catalogos/gabinetes').then(setGabinetes);
    cargarRecordatorios();
    cargarAvisosPendientes();

    api.get<Array<{ estado: string; fechaPrevista: string }>>('/laboratorio').then((trabajos) => {
      const hoy = hoyISO();
      setLabVencido(trabajos.filter((t) => t.estado !== 'entregado' && t.fechaPrevista.slice(0, 10) < hoy).length);
    });
    api.get<Array<{ importe: number }>>(`/cobros?mes=${hoyISO().slice(0, 7)}`).then((cobros) => {
      setCobradoMes(cobros.reduce((a, c) => a + c.importe, 0));
    });
  }, []);

  // Aura (el asistente de voz global) vive fuera de esta página; avisa por aquí cuando
  // agenda o mueve una cita para que el planning se refresque si está abierto.
  useEffect(() => {
    function alCambiarCitas() {
      cargar();
      cargarRecordatorios();
      cargarAvisosPendientes();
    }
    window.addEventListener('powerdent:citas-cambiadas', alCambiarCitas);
    return () => window.removeEventListener('powerdent:citas-cambiadas', alCambiarCitas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  async function marcarEstado(id: string, estado: string) {
    await api.put(`/citas/${id}`, { estado });
    cargar();
  }

  async function pedirConfirmacion(c: Pick<Cita, 'id' | 'fecha' | 'hora' | 'motivo' | 'paciente' | 'dentista'>) {
    if (!c.paciente) return;
    if (!c.paciente.telefono) {
      window.alert('Este paciente no tiene teléfono guardado.');
      return;
    }
    const d = new Date(`${c.fecha}T00:00:00`);
    const texto = `Hola ${c.paciente.nombre}, te escribimos de PowerDent.\n\nTe confirmamos tu cita del ${d.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })} a las ${c.hora}${c.dentista ? ` con ${c.dentista.nombre}` : ''}.\n${c.motivo ? `Ese día haremos: ${c.motivo}\n` : ''}\n¿Nos confirmas respondiendo SÍ? Si te viene mal, dínoslo y lo cambiamos. ¡Gracias!`;
    window.open(`https://wa.me/${telWA(c.paciente.telefono)}?text=${encodeURIComponent(texto)}`, '_blank');
    await api.put(`/citas/${c.id}`, { confirmPedida: new Date().toISOString() });
    cargarRecordatorios();
    if (c.fecha === fecha) cargar();
  }

  async function enviarRecordatorio(r: RecordatorioPendiente) {
    if (!r.paciente || !r.paciente.telefono) {
      window.alert('Este paciente no tiene teléfono guardado.');
      return;
    }
    // Se abre la pestaña ya (dentro del clic, si no el navegador la bloquea al no venir de una
    // acción directa del usuario) y se rellena en cuanto tengamos el mensaje con el enlace.
    const ventana = window.open('', '_blank');
    let enlacePortal = '';
    if (r.pacienteId) {
      try {
        const horasHastaCita = Math.max(1, (new Date(`${r.fecha}T${r.hora}:00`).getTime() - Date.now()) / (1000 * 60 * 60));
        const acceso = await api.post<{ url: string }>('/auth/paciente/generar', {
          pacienteId: r.pacienteId,
          expiraHoras: Math.min(240, Math.ceil(horasHastaCita) + 4),
        });
        enlacePortal = acceso.url;
      } catch {
        /* si falla la generación del enlace, se manda el recordatorio igualmente sin él */
      }
    }
    const d = new Date(`${r.fecha}T00:00:00`);
    const fechaHablada = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const texto = `Hola ${r.paciente.nombre}, te escribimos de PowerDent.\n\n${fraseRecordatorio(r.tipo, fechaHablada, r.hora)}${r.dentista ? ` Con ${r.dentista}.` : ''}${r.motivo ? `\n${r.motivo}` : ''}${enlacePortal ? `\n\nConsulta los detalles de tu cita en tu portal: ${enlacePortal}` : ''}\n\n¡Te esperamos!`;
    const urlWA = `https://wa.me/${telWA(r.paciente.telefono)}?text=${encodeURIComponent(texto)}`;
    if (ventana) ventana.location.href = urlWA;
    else window.open(urlWA, '_blank');
    await api.post(`/citas/${r.id}/recordatorio`, { tipo: r.tipo });
    cargarAvisosPendientes();
  }

  async function marcarConfirmada(c: Cita, val: boolean) {
    await api.put(`/citas/${c.id}`, { confirmada: val });
    cargarRecordatorios();
    if (c.fecha === fecha) cargar();
  }

  const sinFirma = pacientes.filter((p) => !p.consentFirmaArchivoId).length;
  const sinConfirmar = recordatorios.filter((c) => !c.confirmada).length;

  const filas: number[] = [];
  for (let m = H0 * 60; m < H1 * 60; m += 30) filas.push(m);

  function bloqueEstilo(c: Cita, col: number) {
    const ini = Number(c.hora.slice(0, 2)) * 60 + Number(c.hora.slice(3, 5));
    const fila = Math.max(0, Math.round((ini - H0 * 60) / 30));
    const span = Math.max(1, Math.round((c.duracionMin || 30) / 30));
    return {
      gridRow: `${fila + 2} / span ${span}`,
      gridColumn: col,
      '--c': c.dentista?.color || '#7C8199',
    } as CSSProperties;
  }

  function Bloque({ c, col }: { c: Cita; col: number }) {
    return (
      <div className="cita" style={bloqueEstilo(c, col)} onClick={() => (c.paciente ? navigate(`/pacientes/${c.paciente.id}`) : setModalCita(c))}>
        <b>{nombreCita(c)}</b>
        <span className="mini">
          {c.hora} · {c.motivo || ''}
        </span>
        <span className="mini">{c.dentista?.nombre || ''}</span>
        {c.paciente && !c.paciente.consentFirmaArchivoId && (
          <span className="tag bad" style={{ alignSelf: 'flex-start' }}>
            Falta firma
          </span>
        )}
        <button
          className="x"
          title="Editar cita"
          onClick={(e) => {
            e.stopPropagation();
            setModalCita(c);
          }}
        >
          ✏️
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Agenda</h1>
          <p>
            {new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {gabinetes.length} gabinetes
          </p>
        </div>
        <div className="acciones">
          <button className="btn gh sm" onClick={() => setFecha((f) => sumarDiasISO(f, -1))}>
            ←
          </button>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: 150 }} />
          <button className="btn gh sm" onClick={() => setFecha((f) => sumarDiasISO(f, 1))}>
            →
          </button>
          <button className="btn gh sm" onClick={() => setFecha(hoyISO())}>
            Hoy
          </button>
          <button className="btn pri" onClick={() => setModalCita('nueva')}>
            Añadir cita
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <span>Citas del día</span>
          <b>{citas.length}</b>
        </div>
        <div className="kpi">
          <span>Fichas sin firmar</span>
          <b style={{ color: sinFirma ? 'var(--rojo)' : 'inherit' }}>{sinFirma}</b>
        </div>
        <div className="kpi">
          <span>Lab. vencido</span>
          <b style={{ color: labVencido ? 'var(--rojo)' : 'inherit' }}>{labVencido}</b>
        </div>
        <div className="kpi">
          <span>Cobrado este mes</span>
          <b>{cobradoMes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</b>
        </div>
      </div>

      {avisosPendientes.length > 0 && (
        <div className="card">
          <div className="entre">
            <h3>Recordatorios de cita</h3>
            <span className="tag warn">{avisosPendientes.length} por enviar</span>
          </div>
          <p className="mini">Semana, 3 días, 1 día y 1 hora antes — envía por WhatsApp con un toque.</p>
          <hr />
          <table>
            <tbody>
              {avisosPendientes.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ width: 96 }}>
                    {new Date(`${r.fecha}T00:00:00`).toLocaleDateString('es-ES')}
                    <div className="mini">{r.hora}</div>
                  </td>
                  <td>
                    <b>{r.paciente ? `${r.paciente.nombre} ${r.paciente.apellidos}`.trim() : 'Paciente'}</b>
                    <div className="mini">
                      {r.motivo || ''} {r.paciente?.telefono ? `· ${r.paciente.telefono}` : '· sin teléfono'}
                    </div>
                  </td>
                  <td style={{ width: 130 }}>
                    <span className="tag info">{ETIQUETA_RECORDATORIO[r.tipo]}</span>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn pri sm" onClick={() => enviarRecordatorio(r)}>
                      Enviar recordatorio
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* lista compacta: única versión visible en móvil */}
      <div className="card solo-lista">
        <div className="entre" style={{ marginBottom: 8 }}>
          <h3>Citas del día</h3>
          <span className="mini">{citas.length} citas</span>
        </div>
        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : citas.length === 0 ? (
          <div className="vacio">Sin citas hoy.</div>
        ) : (
          <table>
            <tbody>
              {citas.map((c) => (
                <tr key={c.id} className="click" onClick={() => setModalCita(c)}>
                  <td className="mono" style={{ width: 52, borderLeft: `3px solid ${c.dentista?.color || '#7C8199'}` }}>
                    {c.hora}
                  </td>
                  <td>
                    <b>{nombreCita(c)}</b>
                    <div className="mini">
                      {c.motivo || ''} · {c.gabinete?.nombre || 'sin gabinete'} · {c.dentista?.nombre || ''}
                    </div>
                    <span className={TAG_ESTADO[c.estado] || 'tag'}>{c.estado}</span>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {c.estado !== 'hecha' && (
                      <button
                        className="btn gh sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          marcarEstado(c.id, 'hecha');
                        }}
                      >
                        Marcar hecha
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* planning por gabinete: única versión visible en escritorio */}
      <div className="card planning-wrap">
        <div className="entre" style={{ marginBottom: 10 }}>
          <h3>Planning por gabinete</h3>
          <span className="mini">Toca una cita para abrir la ficha del paciente · toca ✏️ para editarla</span>
        </div>
        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : (
          <div
            className="planning"
            style={{
              gridTemplateColumns: `58px repeat(${gabinetes.length},minmax(150px,1fr))`,
              gridTemplateRows: `34px repeat(${filas.length},34px)`,
            }}
          >
            <div className="ph esq" />
            {gabinetes.map((g) => (
              <div className="ph" key={g.id}>
                <b>{g.nombre}</b>
                <span>{g.uso || ''}</span>
              </div>
            ))}
            {filas.map((m, i) => (
              <div className="hora" style={{ gridRow: i + 2 }} key={m}>
                {String(Math.floor(m / 60)).padStart(2, '0')}:{String(m % 60).padStart(2, '0')}
              </div>
            ))}
            {gabinetes.map((g, gi) => (
              <div className="col" style={{ gridColumn: gi + 2, gridRow: `2 / span ${filas.length}` }} key={g.id} />
            ))}
            {gabinetes.map((g, gi) =>
              citas.filter((c) => c.gabinete?.id === g.id).map((c) => <Bloque c={c} col={gi + 2} key={c.id} />),
            )}
          </div>
        )}
      </div>

      {recordatorios.length > 0 && (
        <div className="card">
          <div className="entre">
            <h3>Confirmación de las próximas citas</h3>
            <span className={`tag ${sinConfirmar ? 'warn' : 'ok'}`}>{sinConfirmar ? `${sinConfirmar} sin confirmar` : 'todas confirmadas'}</span>
          </div>
          <p className="mini">Pide la confirmación por WhatsApp y marca aquí quién ha contestado.</p>
          <hr />
          <table>
            <tbody>
              {recordatorios.map((c) => (
                <tr key={c.id}>
                  <td className="mono" style={{ width: 96 }}>
                    {new Date(`${c.fecha}T00:00:00`).toLocaleDateString('es-ES')}
                    <div className="mini">{c.hora}</div>
                  </td>
                  <td>
                    <b>{nombreCita(c)}</b>
                    <div className="mini">
                      {c.motivo || ''} {c.paciente?.telefono ? `· ${c.paciente.telefono}` : '· sin teléfono'}
                    </div>
                    {c.confirmPedida && <span className="tag info">pedida {new Date(c.confirmPedida).toLocaleDateString('es-ES')}</span>}
                  </td>
                  <td style={{ width: 120 }}>{c.confirmada ? <span className="tag ok">Confirmada</span> : <span className="tag warn">Sin confirmar</span>}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className={`btn ${c.confirmPedida ? 'gh' : 'pri'} sm`} onClick={() => pedirConfirmacion(c)}>
                      {c.confirmPedida ? 'Reenviar' : 'Pedir confirmación'}
                    </button>{' '}
                    {c.confirmada ? (
                      <button className="btn gh sm" onClick={() => marcarConfirmada(c, false)}>
                        Quitar
                      </button>
                    ) : (
                      <button className="btn gh sm" onClick={() => marcarConfirmada(c, true)}>
                        Ha confirmado
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalCita && (
        <CitaModal
          cita={modalCita === 'nueva' ? null : modalCita}
          fechaPorDefecto={fecha}
          huecos={huecos}
          pacientes={pacientes}
          dentistas={dentistas}
          gabinetes={gabinetes}
          onClose={() => setModalCita(null)}
          onGuardado={() => {
            setModalCita(null);
            cargar();
            cargarRecordatorios();
          }}
        />
      )}
    </div>
  );
}

function CitaModal({
  cita,
  fechaPorDefecto,
  huecos,
  pacientes,
  dentistas,
  gabinetes,
  onClose,
  onGuardado,
}: {
  cita: Cita | null;
  fechaPorDefecto: string;
  huecos: string[];
  pacientes: Paciente[];
  dentistas: Dentista[];
  gabinetes: Gabinete[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const dentistaSelectRef = useRef<HTMLSelectElement>(null);

  function alCambiarGabinete(gabineteId: string) {
    const asignado = dentistas.find((d) => d.gabineteId === gabineteId);
    if (asignado && dentistaSelectRef.current) dentistaSelectRef.current.value = asignado.id;
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      pacienteId: form.get('pacienteId') || undefined,
      nombreLibre: form.get('nombreLibre') || undefined,
      fecha: form.get('fecha'),
      hora: form.get('hora'),
      duracionMin: Number(form.get('duracionMin')) || 30,
      dentistaId: form.get('dentistaId') || undefined,
      gabineteId: form.get('gabineteId') || undefined,
      motivo: form.get('motivo') || undefined,
    };
    try {
      if (cita) await api.put(`/citas/${cita.id}`, payload);
      else await api.post('/citas', payload);
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la cita');
    }
  }

  async function eliminar() {
    if (!cita) return;
    if (!window.confirm('¿Eliminar esta cita?')) return;
    await api.del(`/citas/${cita.id}`);
    onGuardado();
  }

  // Las horas ya reservadas de otras citas no salen en /huecos; al editar hay que ofrecer
  // también la hora actual de la cita para no perderla del desplegable.
  const horasDisponibles = cita && !huecos.includes(cita.hora) ? [cita.hora, ...huecos].sort() : huecos;

  return (
    <Modal onClose={onClose}>
      <h2>{cita ? 'Editar cita' : 'Nueva cita'}</h2>
      <form onSubmit={guardar}>
        <div className="grid g2" style={{ marginTop: 14 }}>
          <div className="f">
            <label>Paciente</label>
            <select name="pacienteId" defaultValue={cita?.paciente?.id || ''}>
              <option value="">— nuevo / sin ficha —</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Si es nuevo, nombre</label>
            <input name="nombreLibre" defaultValue={cita?.nombreLibre || ''} placeholder="Nombre y apellidos" />
          </div>
          <div className="f">
            <label>Fecha</label>
            <input type="date" name="fecha" defaultValue={cita?.fecha || fechaPorDefecto} />
          </div>
          <div className="f">
            <label>Hora</label>
            <select name="hora" defaultValue={cita?.hora} required>
              {horasDisponibles.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Duración (min)</label>
            <select name="duracionMin" defaultValue={cita?.duracionMin || 30}>
              {DURACIONES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Gabinete</label>
            <select name="gabineteId" defaultValue={cita?.gabinete?.id || ''} onChange={(e) => alCambiarGabinete(e.target.value)}>
              <option value="">—</option>
              {gabinetes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Profesional</label>
            <select name="dentistaId" defaultValue={cita?.dentista?.id || ''} ref={dentistaSelectRef}>
              <option value="">—</option>
              {dentistas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Motivo</label>
            <input name="motivo" defaultValue={cita?.motivo || ''} placeholder="Revisión, control, extracción…" />
          </div>
        </div>
        {error && (
          <p className="mini" style={{ color: 'var(--rojo)' }}>
            {error}
          </p>
        )}
        <div className="fila" style={{ justifyContent: 'flex-end' }}>
          {cita && (
            <>
              <a className="btn gh" href={gcalURL(cita)} target="_blank" rel="noreferrer">
                Añadir a Google
              </a>
              <button className="btn dan" type="button" onClick={eliminar}>
                Eliminar
              </button>
            </>
          )}
          <button className="btn gh" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn pri" type="submit">
            Guardar cita
          </button>
        </div>
      </form>
    </Modal>
  );
}
