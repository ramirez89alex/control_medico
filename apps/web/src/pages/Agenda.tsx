import { CSSProperties, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  consentFirmaArchivoId: string | null;
}

interface Dentista {
  id: string;
  nombre: string;
  color: string;
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

// Horario visible del planning, igual que en la app original (8:00–21:00 en tramos de 30').
const H0 = 8;
const H1 = 21;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(fecha: string, n: number) {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function Agenda() {
  const [fecha, setFecha] = useState(hoyISO());
  const [citas, setCitas] = useState<Cita[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [dentistas, setDentistas] = useState<Dentista[]>([]);
  const [gabinetes, setGabinetes] = useState<Gabinete[]>([]);
  const [huecos, setHuecos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

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

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  useEffect(() => {
    api.get<Paciente[]>('/pacientes').then(setPacientes);
    api.get<Dentista[]>('/catalogos/dentistas').then(setDentistas);
    api.get<Gabinete[]>('/catalogos/gabinetes').then(setGabinetes);
  }, []);

  async function crearCita(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post('/citas', {
      pacienteId: form.get('pacienteId') || undefined,
      hora: form.get('hora'),
      duracionMin: Number(form.get('duracionMin')) || 30,
      fecha,
      dentistaId: form.get('dentistaId') || undefined,
      gabineteId: form.get('gabineteId') || undefined,
      motivo: form.get('motivo') || undefined,
    });
    setMostrarForm(false);
    cargar();
  }

  async function marcarEstado(id: string, estado: string) {
    await api.put(`/citas/${id}`, { estado });
    cargar();
  }

  const sinFirma = pacientes.filter((p) => !p.consentFirmaArchivoId).length;

  const filas: number[] = [];
  for (let m = H0 * 60; m < H1 * 60; m += 30) filas.push(m);

  function bloqueEstilo(c: Cita) {
    const ini = Number(c.hora.slice(0, 2)) * 60 + Number(c.hora.slice(3, 5));
    const fila = Math.max(0, Math.round((ini - H0 * 60) / 30));
    const span = Math.max(1, Math.round((c.duracionMin || 30) / 30));
    return { gridRow: `${fila + 2} / span ${span}`, '--c': c.dentista?.color || '#7C8199' } as CSSProperties;
  }

  function Bloque({ c }: { c: Cita }) {
    const nombre = c.paciente ? `${c.paciente.nombre} ${c.paciente.apellidos}` : c.nombreLibre || 'Paciente';
    const contenido = (
      <>
        <b>{nombre}</b>
        <span className="mini">
          {c.hora} · {c.motivo || ''}
        </span>
        <span className="mini">{c.dentista?.nombre || ''}</span>
        {c.paciente && !c.paciente.consentFirmaArchivoId && (
          <span className="tag bad" style={{ alignSelf: 'flex-start' }}>
            Falta firma
          </span>
        )}
      </>
    );
    return c.paciente ? (
      <Link className="cita" style={bloqueEstilo(c)} to={`/pacientes/${c.paciente.id}`}>
        {contenido}
      </Link>
    ) : (
      <div className="cita" style={bloqueEstilo(c)}>
        {contenido}
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
          <button className="btn gh sm" onClick={() => setFecha((f) => sumarDias(f, -1))}>
            ←
          </button>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: 150 }} />
          <button className="btn gh sm" onClick={() => setFecha((f) => sumarDias(f, 1))}>
            →
          </button>
          <button className="btn gh sm" onClick={() => setFecha(hoyISO())}>
            Hoy
          </button>
          <button className="btn pri" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : 'Añadir cita'}
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
          <b className="mini">— (fase siguiente)</b>
        </div>
        <div className="kpi">
          <span>Cobrado este mes</span>
          <b className="mini">— (fase siguiente)</b>
        </div>
      </div>

      {mostrarForm && (
        <div className="card">
          <form onSubmit={crearCita}>
            <div className="grid g3">
              <div className="f">
                <label>Paciente</label>
                <select name="pacienteId">
                  <option value="">— sin ficha —</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.apellidos}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Hora</label>
                <select name="hora" required>
                  {huecos.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Duración (min)</label>
                <input type="number" name="duracionMin" defaultValue={30} step={15} min={15} />
              </div>
              <div className="f">
                <label>Dentista</label>
                <select name="dentistaId">
                  <option value="">—</option>
                  {dentistas.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Gabinete</label>
                <select name="gabineteId">
                  <option value="">—</option>
                  {gabinetes.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label>Motivo</label>
                <input type="text" name="motivo" />
              </div>
            </div>
            <button className="btn pri" type="submit">
              Guardar cita
            </button>
          </form>
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
                <tr key={c.id} className="click">
                  <td className="mono" style={{ width: 52, borderLeft: `3px solid ${c.dentista?.color || '#7C8199'}` }}>
                    {c.hora}
                  </td>
                  <td>
                    <b>{c.paciente ? `${c.paciente.nombre} ${c.paciente.apellidos}` : c.nombreLibre || 'Paciente'}</b>
                    <div className="mini">
                      {c.motivo || ''} · {c.gabinete?.nombre || 'sin gabinete'} · {c.dentista?.nombre || ''}
                    </div>
                    <span className={TAG_ESTADO[c.estado] || 'tag'}>{c.estado}</span>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {c.estado !== 'hecha' && (
                      <button className="btn gh sm" onClick={() => marcarEstado(c.id, 'hecha')}>
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
          <span className="mini">Toca una cita para abrir la ficha del paciente</span>
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
              citas
                .filter((c) => c.gabinete?.id === g.id)
                .map((c) => (
                  <div style={{ gridColumn: gi + 2, display: 'contents' }} key={c.id}>
                    <Bloque c={c} />
                  </div>
                )),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
