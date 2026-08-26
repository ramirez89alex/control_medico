import { CSSProperties, FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  alergias: string | null;
  medicacion: string | null;
}

interface Dentista {
  id: string;
  nombre: string;
  rol: string;
  color: string;
  activo: boolean;
}

interface Gabinete {
  id: string;
  nombre: string;
}

interface Cita {
  id: string;
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

interface Historia {
  id: string;
  fecha: string;
  acto: string;
  piezas: string | null;
  nota: string;
}

const TAG_ESTADO: Record<string, string> = {
  llegado: 'tag warn',
  silla: 'tag bad',
  hecha: 'tag ok',
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function minutosDe(hora: string) {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

function ocupaAhora(c: Cita, minAhora: number) {
  const i = minutosDe(c.hora);
  return minAhora >= i && minAhora < i + (c.duracionMin || 30);
}

export function Sillon() {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [dentistas, setDentistas] = useState<Dentista[]>([]);
  const [gabinetes, setGabinetes] = useState<Gabinete[]>([]);
  const [historiaHoy, setHistoriaHoy] = useState<Historia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [apuntando, setApuntando] = useState(false);
  const [minAhora, setMinAhora] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  async function cargar() {
    setCargando(true);
    const [c, d, g] = await Promise.all([
      api.get<Cita[]>(`/citas?desde=${hoyISO()}&hasta=${hoyISO()}`),
      api.get<Dentista[]>('/catalogos/dentistas'),
      api.get<Gabinete[]>('/catalogos/gabinetes'),
    ]);
    setCitas(c);
    setDentistas(d);
    setGabinetes(g);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    const id = setInterval(() => {
      const n = new Date();
      setMinAhora(n.getHours() * 60 + n.getMinutes());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const enSilla = citas.find((c) => c.estado === 'silla');

  useEffect(() => {
    if (!enSilla?.paciente) {
      setHistoriaHoy([]);
      return;
    }
    api.get<{ historiaClinica: Historia[] }>(`/pacientes/${enSilla.paciente.id}`).then((p) =>
      setHistoriaHoy(p.historiaClinica.filter((h) => h.fecha.slice(0, 10) === hoyISO())),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enSilla?.id]);

  async function sentar(citaId: string) {
    await api.put(`/citas/${citaId}`, { estado: 'silla' });
    cargar();
  }

  async function marcarLlegado(citaId: string) {
    await api.put(`/citas/${citaId}`, { estado: 'llegado' });
    cargar();
  }

  async function terminarVisita(citaId: string) {
    await api.put(`/citas/${citaId}`, { estado: 'hecha' });
    cargar();
  }

  async function apuntar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!enSilla?.paciente) return;
    const form = new FormData(e.currentTarget);
    await api.post(`/pacientes/${enSilla.paciente.id}/historia`, {
      acto: form.get('acto'),
      piezas: form.get('piezas') || undefined,
      nota: form.get('nota'),
    });
    setApuntando(false);
    api.get<{ historiaClinica: Historia[] }>(`/pacientes/${enSilla.paciente.id}`).then((p) =>
      setHistoriaHoy(p.historiaClinica.filter((h) => h.fecha.slice(0, 10) === hoyISO())),
    );
  }

  const manana = citas.filter((c) => c.hora < '14:00').length;
  const tarde = citas.filter((c) => c.hora >= '14:00').length;

  const CabTop = ({ children }: { children: ReactNode }) => (
    <div className="topbar">
      <div>
        <h1>{enSilla ? 'En el sillón' : 'Sillón y sala'}</h1>
        <p>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · {citas.length} citas ({manana} mañana / {tarde}{' '}
          tarde)
        </p>
      </div>
      <div className="acciones">{children}</div>
    </div>
  );

  if (cargando) {
    return (
      <div>
        <CabTop>
          <Link className="btn pri" to="/agenda">
            Añadir cita
          </Link>
        </CabTop>
        <p className="vacio">Cargando…</p>
      </div>
    );
  }

  const BloqueGabinetes = () => (
    <div className="gabrow">
      {gabinetes.map((g) => {
        const ocupada = citas.find((c) => c.gabinete?.id === g.id && ocupaAhora(c, minAhora) && c.estado !== 'hecha');
        const siguiente = citas
          .filter((c) => c.gabinete?.id === g.id && minutosDe(c.hora) > minAhora)
          .sort((a, b) => a.hora.localeCompare(b.hora))[0];
        return (
          <div className={`gmini ${ocupada ? 'ocu' : ''}`} style={{ '--c': ocupada?.dentista?.color || '#7C8199' } as CSSProperties} key={g.id}>
            <div className="entre">
              <b>{g.nombre}</b>
              <span className={`tag ${ocupada ? 'bad' : 'ok'}`}>{ocupada ? 'Ocupado' : 'Libre'}</span>
            </div>
            {ocupada ? (
              <>
                <div className="gnom">{ocupada.paciente ? `${ocupada.paciente.nombre} ${ocupada.paciente.apellidos}` : ocupada.nombreLibre || 'Paciente'}</div>
                <div className="mini">
                  {ocupada.motivo || ''}
                  {ocupada.dentista ? ` · ${ocupada.dentista.nombre}` : ''}
                </div>
                {ocupada.estado !== 'silla' && (
                  <button className="btn pri sm" style={{ marginTop: 6 }} onClick={() => sentar(ocupada.id)}>
                    Está en la silla
                  </button>
                )}
              </>
            ) : (
              <div className="mini" style={{ margin: '6px 0' }}>
                {siguiente
                  ? `Siguiente ${siguiente.hora} · ${siguiente.paciente ? `${siguiente.paciente.nombre} ${siguiente.paciente.apellidos}` : siguiente.nombreLibre || ''}`
                  : 'Sin más citas hoy'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const BloqueCitasHoy = () => (
    <div className="card">
      <div className="entre">
        <h3>Citas de hoy</h3>
        <span className="mini">{citas.length} citas · {citas.filter((c) => c.estado === 'hecha').length} hechas</span>
      </div>
      <hr />
      {citas.length === 0 ? (
        <div className="vacio">Sin citas hoy.</div>
      ) : (
        <table>
          <tbody>
            {citas.map((c) => (
              <tr key={c.id}>
                <td className="mono" style={{ width: 52, borderLeft: `3px solid ${c.dentista?.color || '#7C8199'}` }}>
                  {c.hora}
                </td>
                <td>
                  <b>{c.paciente ? `${c.paciente.nombre} ${c.paciente.apellidos}` : c.nombreLibre || 'Paciente'}</b>
                  <div className="mini">{c.motivo || ''}</div>
                  {c.confirmada && <span className="tag ok">Confirmada</span>}{' '}
                  {c.estado !== 'programada' && c.estado !== 'cancelada' && <span className={TAG_ESTADO[c.estado] || 'tag'}>{c.estado}</span>}
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {c.estado === 'programada' && (
                    <button className="btn gh sm" onClick={() => marcarLlegado(c.id)}>
                      Ha llegado
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const BloqueProfesionales = () => (
    <div className="card">
      <h3>Profesionales</h3>
      <hr />
      <table>
        <tbody>
          {dentistas
            .filter((d) => d.activo)
            .map((d) => {
              const enUso = citas.find((c) => c.dentista?.id === d.id && ocupaAhora(c, minAhora) && c.estado !== 'hecha');
              const resto = citas.filter((c) => c.dentista?.id === d.id && minutosDe(c.hora) > minAhora && c.estado !== 'hecha').length;
              return (
                <tr key={d.id}>
                  <td style={{ width: 12 }}>
                    <span style={{ display: 'block', width: 10, height: 10, borderRadius: 99, background: d.color }} />
                  </td>
                  <td>
                    <b>{d.nombre}</b>
                    <div className="mini">{d.rol}</div>
                  </td>
                  <td>{enUso ? <span className="tag bad">En {enUso.gabinete?.nombre || 'gabinete'}</span> : <span className="tag ok">Disponible</span>}</td>
                  <td className="mini">{resto} citas por delante</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );

  if (!enSilla) {
    return (
      <div>
        <CabTop>
          <Link className="btn pri" to="/agenda">
            Añadir cita
          </Link>
        </CabTop>
        <BloqueGabinetes />
        <div className="grid g2" style={{ marginTop: 14 }}>
          <BloqueCitasHoy />
          <BloqueProfesionales />
        </div>
      </div>
    );
  }

  const p = enSilla.paciente;

  return (
    <div>
      <CabTop>
        {p && (
          <Link className="btn gh" to={`/pacientes/${p.id}`}>
            Ficha completa
          </Link>
        )}
        <button className="btn pri" onClick={() => terminarVisita(enSilla.id)}>
          Terminar visita
        </button>
      </CabTop>
      <div className="mini" style={{ margin: '-8px 0 12px' }}>
        {enSilla.gabinete?.nombre || ''} · {enSilla.dentista?.nombre || ''} · entró a las {enSilla.hora}
      </div>

      <div className="sillon">
        <div className="spac">
          <h2 style={p ? { cursor: 'pointer' } : undefined}>
            {p ? (
              <Link to={`/pacientes/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                {p.nombre} {p.apellidos}
              </Link>
            ) : (
              enSilla.nombreLibre || 'Paciente'
            )}
          </h2>
          <p>{enSilla.motivo || 'Consulta'}</p>
          {p?.alergias && <span className="tag bad">Alergias: {p.alergias}</span>}
          {p?.medicacion && <span className="tag warn">Medicación: {p.medicacion}</span>}
        </div>
        <div className="svoz">
          <div className="entre">
            <h3>Notas de esta visita</h3>
          </div>
          <p className="mini" style={{ marginTop: 8 }}>
            El dictado por voz llega en una fase siguiente. Por ahora se apunta a mano.
          </p>
          <button className="btn pri" style={{ marginTop: 8 }} onClick={() => setApuntando(true)}>
            Apuntar a mano
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Lo apuntado hoy</h3>
        <hr />
        {historiaHoy.length ? (
          historiaHoy.map((h) => (
            <div key={h.id} style={{ borderLeft: '3px solid var(--marca)', paddingLeft: 11, marginBottom: 12 }}>
              <b>{h.acto}</b> {h.piezas && <span className="tag info">pieza {h.piezas}</span>}
              <div className="mini">{h.nota}</div>
            </div>
          ))
        ) : (
          <div className="vacio">Nada aún. Apunta a mano lo que vayas haciendo.</div>
        )}
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <BloqueCitasHoy />
        <BloqueProfesionales />
      </div>

      {apuntando && (
        <Modal onClose={() => setApuntando(false)}>
          <h2>Apuntar en la historia</h2>
          <form onSubmit={apuntar}>
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div className="f">
                <label>Acto realizado</label>
                <input name="acto" placeholder="Extracción 65" required />
              </div>
              <div className="f">
                <label>Piezas</label>
                <input name="piezas" />
              </div>
            </div>
            <div className="f">
              <label>Nota</label>
              <textarea name="nota" required />
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="btn gh" type="button" onClick={() => setApuntando(false)}>
                Cancelar
              </button>
              <button className="btn pri" type="submit">
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
