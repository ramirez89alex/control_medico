import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hoyISO } from '@powerdent/shared';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';

interface PacienteCumple {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  nacimiento: string;
}

interface PacienteRevision {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  ultimaVisita: string;
}

type EstadoCampana = 'preparada' | 'en_curso' | 'terminada';

interface Campana {
  id: string;
  nombre: string;
  canal: string;
  fecha: string;
  publico: string;
  asunto: string | null;
  cuerpo: string | null;
  estado: EstadoCampana;
  enviados: number;
  respuestas: number;
  citas: number;
  coste: number;
  notas: string | null;
}

type EstadoIdea = 'nueva' | 'en_estudio' | 'en_marcha' | 'descartada' | 'hecha';

interface Idea {
  id: string;
  texto: string;
  autor: string | null;
  estado: EstadoIdea;
  votos: number;
  fecha: string;
}

interface Clinica {
  nombre: string;
  telefono: string | null;
  mesesRevision: number;
}

type ClavePlantilla = 'cumple' | 'revision' | 'recuperar' | 'post';

const PLANTILLAS: Record<ClavePlantilla, { t: string; a: string; c: string }> = {
  cumple: {
    t: 'Felicitación de cumpleaños',
    a: '¡Felicidades, {nombre}!',
    c: 'Hola {nombre}, todo el equipo de {clinica} te desea un feliz cumpleaños. Que lo pases genial y sigas luciendo esa sonrisa. 🎂',
  },
  revision: {
    t: 'Toca revisión',
    a: '{nombre}, toca revisión',
    c: 'Hola {nombre}, hace ya un tiempo de tu última visita a {clinica}. Una revisión y una higiene al año evitan la mayoría de los problemas (y de los gastos). ¿Te buscamos hueco? Responde a este mensaje o llámanos al {tel}.',
  },
  recuperar: {
    t: 'Reactivar paciente',
    a: 'Te echamos de menos, {nombre}',
    c: 'Hola {nombre}, hace tiempo que no te vemos por {clinica}. Si quedó algún tratamiento a medias o tienes molestias, dínoslo y te damos cita sin compromiso.',
  },
  post: {
    t: 'Seguimiento tras tratamiento',
    a: '¿Cómo vas, {nombre}?',
    c: 'Hola {nombre}, ¿qué tal va todo después de tu última visita a {clinica}? Si notas alguna molestia, cuéntanoslo y lo revisamos.',
  },
};

const CANALES = ['Email', 'WhatsApp', 'Instagram', 'Facebook', 'Google Ads', 'Papel', 'Radio'];
const ESTADOS_CAMPANA: EstadoCampana[] = ['preparada', 'en_curso', 'terminada'];
const ESTADOS_IDEA: EstadoIdea[] = ['nueva', 'en_estudio', 'en_marcha', 'descartada', 'hecha'];

function rellena(txt: string, p: { nombre: string; apellidos: string } | null, clinicaNombre: string, clinicaTel: string) {
  return txt
    .replace(/{nombre}/g, p?.nombre || '')
    .replace(/{apellidos}/g, p?.apellidos || '')
    .replace(/{clinica}/g, clinicaNombre || 'PowerDent')
    .replace(/{tel}/g, clinicaTel || '');
}

function telWA(tel: string) {
  const limpio = tel.replace(/[^\d]/g, '');
  return limpio.length === 9 ? `34${limpio}` : limpio;
}

function csv(filas: string[][], nombre: string) {
  const texto = filas.map((f) => f.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}_${hoyISO()}.csv`;
  a.click();
}

function diasHasta(nacimientoISO: string): number {
  const hoy = hoyISO();
  const mmdd = nacimientoISO.slice(5, 10);
  const cumpleEsteAnio = `${hoy.slice(0, 4)}-${mmdd}`;
  let dias = Math.round((new Date(`${cumpleEsteAnio}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime()) / 86400000);
  if (dias < -2) dias += 365;
  return dias;
}

type Tab = 'fechas' | 'captacion' | 'campanas' | 'ideas';

export function Marketing() {
  const [tab, setTab] = useState<Tab>('fechas');
  const [clinica, setClinica] = useState<Clinica | null>(null);
  const [cumples, setCumples] = useState<PacienteCumple[]>([]);
  const [revision, setRevision] = useState<PacienteRevision[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [componiendo, setComponiendo] = useState<{ clave: ClavePlantilla | 'idea'; publico: string; asunto: string; cuerpo: string } | null>(null);
  const [viendoCampana, setViendoCampana] = useState<Campana | null>(null);
  const [nuevaIdea, setNuevaIdea] = useState(false);

  async function cargar() {
    const [c, cu, r, ca, id] = await Promise.all([
      api.get<Clinica>('/catalogos/clinica'),
      api.get<PacienteCumple[]>('/marketing/cumpleanos'),
      api.get<PacienteRevision[]>('/marketing/revision'),
      api.get<Campana[]>('/marketing/campanas'),
      api.get<Idea[]>('/marketing/ideas'),
    ]);
    setClinica(c);
    setCumples(cu);
    setRevision(r);
    setCampanas(ca);
    setIdeas(id);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const proximosCumples = useMemo(
    () =>
      cumples
        .map((p) => ({ p, dias: diasHasta(p.nacimiento) }))
        .filter((x) => x.dias >= -1 && x.dias <= 15)
        .sort((a, b) => a.dias - b.dias),
    [cumples],
  );

  function enviarPlantilla(p: { nombre: string; apellidos: string; telefono: string | null; email: string | null }, clave: ClavePlantilla, via: 'wa' | 'mail') {
    if (!clinica) return;
    const pl = PLANTILLAS[clave];
    const cuerpo = rellena(pl.c, p, clinica.nombre, clinica.telefono || '');
    const asunto = rellena(pl.a, p, clinica.nombre, clinica.telefono || '');
    if (via === 'mail') {
      if (!p.email) return alert('Ese paciente no tiene email en la ficha');
      window.open(`mailto:${p.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`, '_blank');
    } else {
      if (!p.telefono) {
        navigator.clipboard?.writeText(cuerpo);
        alert('Sin teléfono: mensaje copiado');
        return;
      }
      window.open(`https://wa.me/${telWA(p.telefono)}?text=${encodeURIComponent(cuerpo)}`, '_blank');
    }
  }

  async function guardarMesesRevision(valor: number) {
    setClinica((c) => (c ? { ...c, mesesRevision: valor } : c));
    await api.put('/catalogos/clinica', { mesesRevision: valor });
    const r = await api.get<PacienteRevision[]>('/marketing/revision');
    setRevision(r);
  }

  function abrirComposer(clave: ClavePlantilla) {
    setComponiendo({ clave, publico: clave, asunto: PLANTILLAS[clave].a, cuerpo: PLANTILLAS[clave].c });
  }

  async function guardarCampana() {
    if (!componiendo || componiendo.clave === 'idea') return;
    const nueva = await api.post<Campana>('/marketing/campanas', {
      nombre: PLANTILLAS[componiendo.clave].t,
      canal: 'Email',
      publico: componiendo.publico,
      asunto: componiendo.asunto,
      cuerpo: componiendo.cuerpo,
    });
    setCampanas((cs) => [nueva, ...cs]);
    setComponiendo(null);
    setTab('campanas');
  }

  function copiarCorreos() {
    if (!componiendo) return;
    const lista = componiendo.publico === 'revision' ? revision : cumples;
    const correos = lista.map((p) => p.email).filter(Boolean).join(', ');
    navigator.clipboard?.writeText(correos);
    alert('Correos copiados: pégalos en copia oculta');
  }

  function exportarLista(tipo: 'revision' | 'general') {
    const lista = tipo === 'revision' ? revision : cumples;
    csv(
      [['nombre', 'apellidos', 'email', 'telefono'], ...lista.map((p) => [p.nombre, p.apellidos, p.email || '', p.telefono || ''])],
      `publico_${tipo}`,
    );
  }

  async function actualizarCampana(id: string, campo: keyof Campana, valor: unknown) {
    setCampanas((cs) => cs.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)));
    await api.put(`/marketing/campanas/${id}`, { [campo]: valor });
  }

  async function guardarTextoCampana(id: string, asunto: string, cuerpo: string, notas: string) {
    await api.put(`/marketing/campanas/${id}`, { asunto, cuerpo, notas });
    setCampanas((cs) => cs.map((c) => (c.id === id ? { ...c, asunto, cuerpo, notas } : c)));
    setViendoCampana(null);
  }

  async function crearIdea(texto: string, autor: string) {
    const idea = await api.post<Idea>('/marketing/ideas', { texto, autor });
    setIdeas((is) => [idea, ...is].sort((a, b) => b.votos - a.votos));
    setNuevaIdea(false);
  }

  async function votarIdea(id: string, votos: number) {
    setIdeas((is) => is.map((i) => (i.id === id ? { ...i, votos } : i)).sort((a, b) => b.votos - a.votos));
    await api.put(`/marketing/ideas/${id}`, { votos });
  }

  async function estadoIdea(id: string, estado: EstadoIdea) {
    setIdeas((is) => is.map((i) => (i.id === id ? { ...i, estado } : i)));
    await api.put(`/marketing/ideas/${id}`, { estado });
  }

  async function ideaACampana(id: string) {
    const campana = await api.post<Campana>(`/marketing/ideas/${id}/a-campana`);
    setCampanas((cs) => [campana, ...cs]);
    setIdeas((is) => is.map((i) => (i.id === id ? { ...i, estado: 'en_marcha' } : i)));
    setTab('campanas');
  }

  const costePorCita = useMemo(() => {
    const coste = campanas.reduce((a, c) => a + c.coste, 0);
    const citas = campanas.reduce((a, c) => a + c.citas, 0);
    return citas ? coste / citas : null;
  }, [campanas]);

  if (cargando || !clinica) return <p className="mini">Cargando…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Marketing y fidelización</h1>
          <p>Mantener el contacto, recuperar pacientes y ordenar las ideas del equipo</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {(
          [
            ['fechas', 'Fechas señaladas'],
            ['captacion', 'Revisiones y captación'],
            ['campanas', 'Campañas'],
            ['ideas', 'Buzón de ideas'],
          ] as const
        ).map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'fechas' && (
        <div className="card">
          <div className="entre">
            <h3>Cumpleaños de los próximos 15 días</h3>
            <span className="mini">{proximosCumples.filter((x) => x.dias <= 0).length} hoy</span>
          </div>
          <p className="mini">Un mensaje el día del cumpleaños es el recordatorio más barato que existe.</p>
          <hr />
          {proximosCumples.length === 0 ? (
            <div className="vacio">Sin cumpleaños próximos. Rellena la fecha de nacimiento en las fichas.</div>
          ) : (
            <table>
              <tbody>
                {proximosCumples.map(({ p, dias }) => (
                  <tr key={p.id}>
                    <td style={{ width: 110 }}>
                      <span className={`tag ${dias <= 0 ? 'bad' : 'info'}`}>Cumpleaños</span>
                      <div className="mini">{dias <= 0 ? 'hoy' : `en ${dias} días`}</div>
                    </td>
                    <td>
                      <b>
                        {p.nombre} {p.apellidos}
                      </b>
                      <div className="mini">
                        {p.telefono || 'sin teléfono'}
                        {p.email ? ` · ${p.email}` : ''}
                      </div>
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn pri sm" onClick={() => enviarPlantilla(p, 'cumple', 'wa')}>
                        WhatsApp
                      </button>{' '}
                      <button className="btn gh sm" onClick={() => enviarPlantilla(p, 'cumple', 'mail')}>
                        Email
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'captacion' && (
        <div className="card">
          <div className="entre">
            <h3>Pacientes que tocan revisión</h3>
            <div className="fila">
              <span className="mini">Sin visita desde hace más de</span>
              <input
                type="number"
                style={{ width: 70 }}
                defaultValue={clinica.mesesRevision}
                onBlur={(e) => {
                  const valor = Number(e.target.value);
                  guardarMesesRevision(Number.isFinite(valor) && valor > 0 ? valor : 6);
                }}
              />
              <span className="mini">meses</span>
            </div>
          </div>
          <p className="mini">{revision.length} pacientes sin cita futura. Es la lista más rentable de la clínica.</p>
          <hr />
          {revision.length === 0 ? (
            <div className="vacio">Todos tus pacientes están al día.</div>
          ) : (
            <>
              <div className="fila" style={{ marginBottom: 10 }}>
                <button className="btn pri sm" onClick={() => abrirComposer('revision')}>
                  Preparar campaña de revisiones
                </button>
                <button className="btn gh sm" onClick={() => exportarLista('revision')}>
                  Exportar lista (CSV)
                </button>
              </div>
              <table>
                <tbody>
                  {revision.slice(0, 40).map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>
                          {p.nombre} {p.apellidos}
                        </b>
                        <div className="mini">
                          {p.telefono || 'sin teléfono'}
                          {p.email ? ` · ${p.email}` : ''}
                        </div>
                      </td>
                      <td className="mini" style={{ width: 130 }}>
                        última visita
                        <br />
                        {new Date(p.ultimaVisita).toLocaleDateString('es-ES')}
                      </td>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn pri sm" onClick={() => enviarPlantilla(p, 'revision', 'wa')}>
                          WhatsApp
                        </button>{' '}
                        <button className="btn gh sm" onClick={() => enviarPlantilla(p, 'recuperar', 'mail')}>
                          Email
                        </button>{' '}
                        <Link className="btn gh sm" style={{ textDecoration: 'none' }} to={`/pacientes/${p.id}`}>
                          Ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {revision.length > 40 && <p className="mini">Mostrando 40 de {revision.length}.</p>}
            </>
          )}
        </div>
      )}

      {tab === 'campanas' && (
        <div className="card">
          <div className="entre">
            <h3>Campañas</h3>
            <div className="fila">
              {(Object.keys(PLANTILLAS) as ClavePlantilla[]).map((k) => (
                <button key={k} className="btn gh sm" onClick={() => abrirComposer(k)}>
                  {PLANTILLAS[k].t}
                </button>
              ))}
            </div>
          </div>
          <p className="mini">Prepara el mensaje aquí y quien lleve la publicidad lo ejecuta y anota resultados.</p>
          <hr />
          {campanas.length === 0 ? (
            <div className="vacio">Sin campañas. Empieza por una de las plantillas de arriba.</div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th>Canal</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th className="num">Enviados</th>
                    <th className="num">Respuestas</th>
                    <th className="num">Citas</th>
                    <th className="num">Coste</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {campanas.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input defaultValue={c.nombre} onBlur={(e) => actualizarCampana(c.id, 'nombre', e.target.value)} />
                      </td>
                      <td>
                        <select defaultValue={c.canal} onChange={(e) => actualizarCampana(c.id, 'canal', e.target.value)}>
                          {CANALES.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </td>
                      <td className="mini">{new Date(c.fecha).toLocaleDateString('es-ES')}</td>
                      <td>
                        <select defaultValue={c.estado} onChange={(e) => actualizarCampana(c.id, 'estado', e.target.value)}>
                          {ESTADOS_CAMPANA.map((o) => (
                            <option key={o} value={o}>
                              {o.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="number" style={{ width: 70 }} defaultValue={c.enviados} onBlur={(e) => actualizarCampana(c.id, 'enviados', Number(e.target.value) || 0)} />
                      </td>
                      <td>
                        <input type="number" style={{ width: 70 }} defaultValue={c.respuestas} onBlur={(e) => actualizarCampana(c.id, 'respuestas', Number(e.target.value) || 0)} />
                      </td>
                      <td>
                        <input type="number" style={{ width: 60 }} defaultValue={c.citas} onBlur={(e) => actualizarCampana(c.id, 'citas', Number(e.target.value) || 0)} />
                      </td>
                      <td>
                        <input type="number" style={{ width: 80 }} defaultValue={c.coste} onBlur={(e) => actualizarCampana(c.id, 'coste', Number(e.target.value) || 0)} />
                      </td>
                      <td className="num">
                        <button className="btn gh sm" onClick={() => setViendoCampana(c)}>
                          Texto
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mini" style={{ marginTop: 10 }}>
                Coste por cita conseguida: {costePorCita != null ? costePorCita.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'}
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'ideas' && (
        <div className="card">
          <div className="entre">
            <h3>Buzón de ideas</h3>
            <button className="btn pri sm" onClick={() => setNuevaIdea(true)}>
              Apuntar idea
            </button>
          </div>
          <p className="mini">Cualquiera del equipo puede dejar una idea aquí; marketing la recoge y la convierte en campaña.</p>
          <hr />
          {ideas.length === 0 ? (
            <div className="vacio">Sin ideas todavía. La primera puede ser tuya.</div>
          ) : (
            <table>
              <tbody>
                {ideas.map((x) => (
                  <tr key={x.id}>
                    <td style={{ width: 56 }} className="num">
                      <button className="btn gh sm" onClick={() => votarIdea(x.id, x.votos + 1)}>
                        ▲ {x.votos}
                      </button>
                    </td>
                    <td>
                      <b>{x.texto}</b>
                      <div className="mini">
                        {x.autor || 'equipo'} · {new Date(x.fecha).toLocaleDateString('es-ES')}
                      </div>
                    </td>
                    <td style={{ width: 130 }}>
                      <select defaultValue={x.estado} onChange={(e) => estadoIdea(x.id, e.target.value as EstadoIdea)}>
                        {ESTADOS_IDEA.map((o) => (
                          <option key={o} value={o}>
                            {o.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <button className="btn gh sm" onClick={() => ideaACampana(x.id)}>
                        A campaña
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {componiendo && componiendo.clave !== 'idea' && (
        <Modal onClose={() => setComponiendo(null)} ancho={560}>
          <h2>{PLANTILLAS[componiendo.clave].t}</h2>
          <p className="mini">
            {(componiendo.publico === 'revision' ? revision : cumples).length} pacientes en la lista ·{' '}
            {(componiendo.publico === 'revision' ? revision : cumples).filter((p) => p.email).length} con email
          </p>
          <div className="f" style={{ marginTop: 12 }}>
            <label>Asunto</label>
            <input value={componiendo.asunto} onChange={(e) => setComponiendo({ ...componiendo, asunto: e.target.value })} />
          </div>
          <div className="f">
            <label>Mensaje</label>
            <textarea style={{ minHeight: 130 }} value={componiendo.cuerpo} onChange={(e) => setComponiendo({ ...componiendo, cuerpo: e.target.value })} />
          </div>
          <p className="mini">Variables: {'{nombre}'}, {'{apellidos}'}, {'{clinica}'}, {'{tel}'}</p>
          <div className="fila" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn gh" onClick={() => setComponiendo(null)}>
              Cancelar
            </button>
            <button className="btn gh" onClick={copiarCorreos}>
              Copiar correos
            </button>
            <button className="btn gh" onClick={() => exportarLista(componiendo.publico === 'revision' ? 'revision' : 'general')}>
              Exportar CSV
            </button>
            <button className="btn pri" onClick={guardarCampana}>
              Guardar campaña
            </button>
          </div>
        </Modal>
      )}

      {viendoCampana && <ModalVerCampana campana={viendoCampana} onCerrar={() => setViendoCampana(null)} onGuardar={guardarTextoCampana} />}

      {nuevaIdea && <ModalNuevaIdea onCerrar={() => setNuevaIdea(false)} onGuardar={crearIdea} />}
    </div>
  );
}

function ModalVerCampana({ campana, onCerrar, onGuardar }: { campana: Campana; onCerrar: () => void; onGuardar: (id: string, asunto: string, cuerpo: string, notas: string) => void }) {
  const [asunto, setAsunto] = useState(campana.asunto || '');
  const [cuerpo, setCuerpo] = useState(campana.cuerpo || '');
  const [notas, setNotas] = useState(campana.notas || '');

  return (
    <Modal onClose={onCerrar} ancho={560}>
      <h2>{campana.nombre}</h2>
      <div className="f" style={{ marginTop: 12 }}>
        <label>Asunto</label>
        <input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
      </div>
      <div className="f">
        <label>Mensaje</label>
        <textarea style={{ minHeight: 150 }} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
      </div>
      <div className="f">
        <label>Notas del equipo de marketing</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      <div className="fila" style={{ justifyContent: 'flex-end' }}>
        <button
          className="btn gh"
          onClick={() => {
            navigator.clipboard?.writeText(cuerpo);
            alert('Texto copiado');
          }}
        >
          Copiar texto
        </button>
        <button className="btn pri" onClick={() => onGuardar(campana.id, asunto, cuerpo, notas)}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}

function ModalNuevaIdea({ onCerrar, onGuardar }: { onCerrar: () => void; onGuardar: (texto: string, autor: string) => void }) {
  const [texto, setTexto] = useState('');
  const [autor, setAutor] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    onGuardar(texto, autor);
  }

  return (
    <Modal onClose={onCerrar}>
      <h2>Nueva idea</h2>
      <form onSubmit={enviar}>
        <div className="f" style={{ marginTop: 12 }}>
          <label>Idea</label>
          <textarea
            placeholder="Sorteo de higiene entre quienes traigan un amigo, vídeo del antes y después, promoción de blanqueamiento en primavera…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
          />
        </div>
        <div className="f">
          <label>Quién la propone</label>
          <input placeholder="Nombre" value={autor} onChange={(e) => setAutor(e.target.value)} />
        </div>
        <div className="fila" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn gh" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn pri">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
