import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hoyISO } from '@powerdent/shared';
import { api, ApiError } from '../lib/api';

interface CandidatoVoz {
  id: string;
  nombre: string;
  apellidos: string;
}

interface EntidadVoz {
  id: string;
  nombre: string;
}

interface PendienteVoz {
  id: string;
  paciente: string;
  fecha: string;
  hora: string;
}

type AccionVoz =
  | 'agendar'
  | 'mover_cita'
  | 'disponibilidad'
  | 'consultar_citas'
  | 'confirmar_pendientes'
  | 'pedir_confirmacion'
  | 'crear_paciente'
  | 'abrir_paciente'
  | 'crear_presupuesto'
  | 'registrar_cobro'
  | 'generar_acceso'
  | 'registrar_historia'
  | 'actualizar_odontograma'
  | 'otro';

interface ResultadoVoz {
  texto: string;
  accion: AccionVoz;
  paciente: string | null;
  candidatos: CandidatoVoz[];
  dentista: EntidadVoz | null;
  gabinete: EntidadVoz | null;
  citaId: string | null;
  citaOriginal: { fecha: string; hora: string } | null;
  fecha: string | null;
  hora: string | null;
  motivo: string | null;
  disponible: boolean | null;
  libres: string[];
  avisos: string[];
  pendientes: PendienteVoz[];
  pacienteContacto: { nombre: string; apellidos: string; telefono: string | null } | null;
  pacienteCreado: CandidatoVoz | null;
  pacienteAbrir: CandidatoVoz | null;
  cobroRegistrado: { id: string; importe: number; forma: string; paciente: string } | null;
  accesoUrl: string | null;
  historiaRegistrada: { id: string; acto: string; paciente: string } | null;
  odontogramaActualizado: { pieza: string; estado: string; paciente: string } | null;
  citasDelDia: { id: string; hora: string; paciente: string; motivo: string | null; dentista: string | null; gabinete: string | null }[];
}

function fechaCorta(fecha: string) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fechaHablada(fecha: string) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function horaHablada(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  return m === 0 ? `las ${h}` : `las ${h} y ${m}`;
}

function sinAcentos(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function telWA(tel: string) {
  const limpio = tel.replace(/[^\d]/g, '');
  return limpio.length === 9 ? `34${limpio}` : limpio;
}

/** Avisa a la pantalla actual (p.ej. la Agenda) de que las citas han podido cambiar,
 * para que refresque su vista si la tiene abierta — el asistente vive fuera de esa
 * página y no tiene acceso directo a su estado. */
function avisarCitasCambiadas() {
  window.dispatchEvent(new Event('powerdent:citas-cambiadas'));
}

/** Elige la mejor voz en español disponible en el navegador (gratis, sin API externa):
 * prioriza voces "Online"/"Natural" (neuronales, más naturales) y las de Google. */
let vozElegida: SpeechSynthesisVoice | null = null;
function refrescarVozElegida() {
  if (!('speechSynthesis' in window)) return;
  const voces = window.speechSynthesis.getVoices();
  if (!voces.length) return;
  const es = voces.filter((v) => v.lang.toLowerCase().startsWith('es'));
  const candidatas = es.length ? es : voces;
  const puntuacion = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let p = 0;
    if (v.lang.toLowerCase() === 'es-es') p += 20;
    if (n.includes('online') || n.includes('natural') || n.includes('neural')) p += 40;
    if (n.includes('google')) p += 25;
    if (n.includes('helena') || n.includes('laura') || n.includes('elvira') || n.includes('lucia')) p += 10;
    return p;
  };
  vozElegida = [...candidatas].sort((a, b) => puntuacion(b) - puntuacion(a))[0] || null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refrescarVozElegida();
  window.speechSynthesis.onvoiceschanged = refrescarVozElegida;
}

const ERRORES_RECONOCIMIENTO: Record<string, string> = {
  'not-allowed': 'Permiso de micrófono denegado. Revisa los permisos del sitio en el navegador.',
  'service-not-allowed': 'El navegador ha bloqueado el reconocimiento de voz.',
  'audio-capture': 'No se ha encontrado ningún micrófono.',
  'no-speech': 'No he oído nada. Inténtalo de nuevo.',
  network: 'Fallo de red al reconocer la voz. Comprueba tu conexión.',
  'language-not-supported': 'El reconocimiento en español no está disponible en este dispositivo.',
  aborted: 'Se ha interrumpido la escucha.',
};

export function AsistenteVoz() {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [manual, setManual] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null);
  const [pacienteId, setPacienteId] = useState('');
  const [esperandoConfirmacion, setEsperandoConfirmacion] = useState(false);
  const reconocimientoRef = useRef<any>(null);
  const reconocimientoConfirmRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      try {
        reconocimientoRef.current?.stop();
        reconocimientoConfirmRef.current?.stop();
        window.speechSynthesis?.cancel();
      } catch {
        /* ignorar */
      }
    };
  }, []);

  function hablar(texto: string, alTerminar?: () => void) {
    if (!('speechSynthesis' in window)) {
      alTerminar?.();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = 1.05;
    if (vozElegida) u.voice = vozElegida;
    if (alTerminar) {
      u.onend = alTerminar;
      u.onerror = alTerminar;
    }
    window.speechSynthesis.speak(u);
  }

  async function reservarDesdeVoz(r: ResultadoVoz, pid: string) {
    if (!r.fecha || !r.hora) return;
    if (r.citaId) {
      await api.put(`/citas/${r.citaId}`, {
        fecha: r.fecha,
        hora: r.hora,
        dentistaId: r.dentista?.id || undefined,
        gabineteId: r.gabinete?.id || undefined,
      });
    } else {
      await api.post('/citas', {
        pacienteId: pid || undefined,
        nombreLibre: pid ? undefined : r.paciente || undefined,
        fecha: r.fecha,
        hora: r.hora,
        duracionMin: 30,
        dentistaId: r.dentista?.id || undefined,
        gabineteId: r.gabinete?.id || undefined,
        motivo: r.motivo || undefined,
      });
    }
    setResultado(null);
    const conProfesional = r.dentista ? ` con ${r.dentista.nombre}` : '';
    const enGabinete = r.gabinete ? ` en ${r.gabinete.nombre}` : '';
    setExito(`Cita confirmada: ${fechaCorta(r.fecha)} a las ${r.hora}${conProfesional}${enGabinete}.`);
    avisarCitasCambiadas();
  }

  function escucharRespuestaSiNo(r: ResultadoVoz, pid: string) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('Este navegador no reconoce voz para confirmar por voz. Usa los botones en pantalla.');
      return;
    }
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const dicho = sinAcentos((e.results[0]?.[0]?.transcript || '').toLowerCase());
      if (/\b(si|confirma|confirmar|vale|correcto|adelante|dale)\b/.test(dicho)) {
        reservarDesdeVoz(r, pid).then(() => hablar('Cita confirmada.'));
      } else if (/\b(no|cancela|cancelar|descarta|descartar)\b/.test(dicho)) {
        setResultado(null);
        hablar('Vale, cancelado.');
      } else {
        hablar('No te he entendido. Puedes confirmar o descartar con los botones en pantalla.');
      }
    };
    rec.onerror = (ev: any) => {
      setError((ERRORES_RECONOCIMIENTO[ev.error] || `No se pudo escuchar la confirmación (${ev.error}).`) + ' Usa los botones en pantalla.');
    };
    rec.onend = () => setEsperandoConfirmacion(false);
    reconocimientoConfirmRef.current = rec;
    setEsperandoConfirmacion(true);
    try {
      rec.start();
    } catch {
      setEsperandoConfirmacion(false);
      setError('No se pudo escuchar la confirmación. Usa los botones en pantalla.');
    }
  }

  function anunciarResultado(r: ResultadoVoz) {
    if (r.accion === 'disponibilidad') {
      const dia = fechaHablada(r.fecha || hoyISO());
      if (!r.libres.length) {
        hablar(`No hay huecos libres el ${dia}.`);
      } else {
        const primeros = r.libres.slice(0, 6).join(', ');
        const resto = r.libres.length > 6 ? `, y ${r.libres.length - 6} más` : '';
        hablar(`El ${dia} tienes ${r.libres.length} huecos libres: ${primeros}${resto}.`);
      }
      return;
    }
    if (r.accion === 'consultar_citas') {
      const dia = fechaHablada(r.fecha || hoyISO());
      const conFiltro = [r.gabinete ? r.gabinete.nombre : '', r.dentista ? r.dentista.nombre : ''].filter(Boolean).join(' con ');
      const filtroHablado = conFiltro ? ` en ${conFiltro}` : '';
      if (!r.citasDelDia.length) {
        hablar(`No hay citas el ${dia}${filtroHablado}.`);
      } else {
        const primeras = r.citasDelDia
          .slice(0, 5)
          .map((c) => `${c.paciente} a ${horaHablada(c.hora)}`)
          .join('; ');
        const resto = r.citasDelDia.length > 5 ? `, y ${r.citasDelDia.length - 5} más` : '';
        hablar(`El ${dia}${filtroHablado} tienes ${r.citasDelDia.length} citas: ${primeras}${resto}.`);
      }
      return;
    }
    if (r.accion === 'confirmar_pendientes') {
      if (!r.pendientes.length) {
        hablar('No tienes ninguna cita pendiente de confirmar en los próximos días.');
      } else {
        const lista = r.pendientes
          .slice(0, 4)
          .map((p) => `${p.paciente} el ${fechaHablada(p.fecha)} a ${horaHablada(p.hora)}`)
          .join('; ');
        hablar(`Tienes ${r.pendientes.length} citas sin confirmar: ${lista}. Pide la confirmación desde la tarjeta en pantalla.`);
      }
      return;
    }
    if (r.accion === 'pedir_confirmacion') {
      if (r.avisos.length) {
        hablar(r.avisos.join(' '));
        return;
      }
      const nombre = r.pacienteContacto ? `${r.pacienteContacto.nombre} ${r.pacienteContacto.apellidos}` : r.paciente || 'el paciente';
      hablar(`Cita de ${nombre} el ${fechaHablada(r.fecha || hoyISO())} a ${horaHablada(r.hora || '')}. Pulsa el botón para abrir WhatsApp y pedir la confirmación.`);
      return;
    }
    if (r.accion === 'crear_paciente') {
      if (r.pacienteCreado) {
        hablar(`Paciente creado: ${r.pacienteCreado.nombre} ${r.pacienteCreado.apellidos}.${r.avisos.length ? ' ' + r.avisos.join(' ') : ''}`);
      } else {
        hablar(r.avisos.join(' ') || 'No he podido crear el paciente.');
      }
      return;
    }
    if (r.accion === 'abrir_paciente') {
      if (r.pacienteAbrir) {
        hablar(`Abriendo la ficha de ${r.pacienteAbrir.nombre} ${r.pacienteAbrir.apellidos}.`);
        navigate(`/pacientes/${r.pacienteAbrir.id}`);
      } else {
        hablar(r.avisos.join(' ') || 'No he encontrado a ese paciente.');
      }
      return;
    }
    if (r.accion === 'crear_presupuesto') {
      if (r.pacienteAbrir) {
        hablar(`Abriendo presupuestos para ${r.pacienteAbrir.nombre} ${r.pacienteAbrir.apellidos}.`);
        navigate(`/presupuestos?paciente=${r.pacienteAbrir.id}`);
      } else {
        hablar(r.avisos.join(' ') || 'No he encontrado a ese paciente.');
      }
      return;
    }
    if (r.accion === 'registrar_cobro') {
      if (r.cobroRegistrado) {
        hablar(`Cobro de ${r.cobroRegistrado.importe} euros registrado para ${r.cobroRegistrado.paciente}.`);
      } else {
        hablar(r.avisos.join(' ') || 'No he podido registrar el cobro.');
      }
      return;
    }
    if (r.accion === 'generar_acceso') {
      if (r.accesoUrl && r.pacienteContacto) {
        hablar(`Acceso generado para ${r.pacienteContacto.nombre} ${r.pacienteContacto.apellidos}. Pulsa el botón en pantalla para copiarlo o enviarlo.`);
      } else {
        hablar(r.avisos.join(' ') || 'No he podido generar el acceso.');
      }
      return;
    }
    if (r.accion === 'registrar_historia') {
      if (r.historiaRegistrada) {
        hablar(`Anotado en la historia de ${r.historiaRegistrada.paciente}: ${r.historiaRegistrada.acto}.`);
      } else {
        hablar(r.avisos.join(' ') || 'No he podido registrar la nota.');
      }
      return;
    }
    if (r.accion === 'actualizar_odontograma') {
      if (r.odontogramaActualizado) {
        hablar(`Pieza ${r.odontogramaActualizado.pieza} marcada como ${r.odontogramaActualizado.estado} en el odontograma de ${r.odontogramaActualizado.paciente}.`);
      } else {
        hablar(r.avisos.join(' ') || 'No he podido actualizar el odontograma.');
      }
      return;
    }
    if (r.accion === 'otro') {
      hablar('Perdona, no te he entendido bien. ¿Puedes repetirlo? Tienes ejemplos de lo que puedo hacer en pantalla.');
      return;
    }
    if (r.accion === 'mover_cita') {
      if (!r.citaId) {
        hablar(r.avisos.join(' ') || 'No he podido encontrar esa cita.');
        return;
      }
      if (!r.fecha || !r.hora) {
        hablar(r.avisos.join(' ') || 'Dime a qué hora quieres cambiarla.');
        return;
      }
      if (!r.disponible) {
        hablar('Esa hora está ocupada. Elige otro hueco libre en pantalla.');
        return;
      }
      const pacienteIdMover = r.candidatos.length === 1 ? r.candidatos[0].id : '';
      const nombrePacienteMover = r.candidatos[0] ? `${r.candidatos[0].nombre} ${r.candidatos[0].apellidos}` : r.paciente || 'el paciente';
      const antes = r.citaOriginal ? ` (antes el ${fechaHablada(r.citaOriginal.fecha)} a ${horaHablada(r.citaOriginal.hora)})` : '';
      const conDentistaMover = r.dentista ? `, con ${r.dentista.nombre}` : '';
      const enGabineteMover = r.gabinete ? `, en ${r.gabinete.nombre}` : '';
      const preguntaMover = `¿Cambio la cita de ${nombrePacienteMover}${antes} al ${fechaHablada(r.fecha)} a ${horaHablada(r.hora)}${conDentistaMover}${enGabineteMover}? Di sí para confirmar, o cancela para descartar.`;
      hablar(preguntaMover, () => escucharRespuestaSiNo(r, pacienteIdMover));
      return;
    }
    if (!r.fecha || !r.hora) {
      hablar('No he encontrado ningún hueco libre en el próximo mes con esos criterios.');
      return;
    }
    if (!r.disponible) {
      hablar('Esa hora está ocupada. Elige otro hueco libre en pantalla.');
      return;
    }
    if (r.candidatos.length > 1) {
      hablar('He encontrado varios pacientes con ese nombre. Elige uno en pantalla y confirma.');
      return;
    }
    const pid = r.candidatos.length === 1 ? r.candidatos[0].id : '';
    const nombrePaciente = r.candidatos[0] ? `${r.candidatos[0].nombre} ${r.candidatos[0].apellidos}` : r.paciente || 'el paciente';
    const conDentista = r.dentista ? ` con ${r.dentista.nombre}` : '';
    const enGabinete = r.gabinete ? ` en ${r.gabinete.nombre}` : '';
    const avisoHablado = r.avisos.length ? ` ${r.avisos.join(' ')}` : '';
    const pregunta = `¿Agendo la cita de ${nombrePaciente}${conDentista}${enGabinete} el ${fechaHablada(r.fecha)} a ${horaHablada(r.hora)}${r.motivo ? `, ${r.motivo}` : ''}?${avisoHablado} Di sí para confirmar, o cancela para descartar.`;
    hablar(pregunta, () => escucharRespuestaSiNo(r, pid));
  }

  async function interpretarVoz(texto: string) {
    setAbierto(true);
    setCargando(true);
    setError(null);
    setExito(null);
    setResultado(null);
    try {
      const r = await api.post<ResultadoVoz>('/voz/interpretar-cita', { texto });
      setResultado(r);
      setPacienteId(r.candidatos.length === 1 ? r.candidatos[0].id : '');
      anunciarResultado(r);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : 'No se pudo interpretar la orden';
      setError(mensaje);
      hablar(mensaje);
    } finally {
      setCargando(false);
    }
  }

  function iniciarEscuchaUnica() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('Este navegador no reconoce voz. Usa Chrome o Edge, o escribe la orden abajo.');
      return;
    }
    setAbierto(true);
    setError(null);
    setParcial('');
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let fin = '';
      let parcialTxt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else parcialTxt += r[0].transcript;
      }
      if (parcialTxt) setParcial(parcialTxt);
      const dicho = fin.trim();
      if (dicho) {
        setParcial('');
        interpretarVoz(dicho);
      }
    };
    rec.onerror = (ev: any) => {
      setError(ERRORES_RECONOCIMIENTO[ev.error] || `No se pudo reconocer la voz (${ev.error}).`);
      setEscuchando(false);
    };
    rec.onend = () => setEscuchando(false);
    reconocimientoRef.current = rec;
    try {
      rec.start();
      setEscuchando(true);
    } catch {
      setEscuchando(false);
    }
  }

  function detenerEscucha() {
    try {
      reconocimientoRef.current?.stop();
    } catch {
      /* ignorar */
    }
    setEscuchando(false);
  }

  function enviarOrdenManual(e: FormEvent) {
    e.preventDefault();
    const texto = manual.trim();
    if (!texto) return;
    setManual('');
    interpretarVoz(texto);
  }

  async function confirmarResultado() {
    if (!resultado || !resultado.fecha || !resultado.hora) return;
    await reservarDesdeVoz(resultado, pacienteId);
  }

  async function pedirConfirmacionWhatsApp(r: ResultadoVoz) {
    if (!r.citaId || !r.pacienteContacto || !r.fecha || !r.hora || !r.pacienteContacto.telefono) return;
    const d = new Date(`${r.fecha}T00:00:00`);
    const texto = `Hola ${r.pacienteContacto.nombre}, te escribimos de PowerDent.\n\nTe confirmamos tu cita del ${d.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })} a las ${r.hora}.\n${r.motivo ? `Ese día haremos: ${r.motivo}\n` : ''}\n¿Nos confirmas respondiendo SÍ? Si te viene mal, dínoslo y lo cambiamos. ¡Gracias!`;
    window.open(`https://wa.me/${telWA(r.pacienteContacto.telefono)}?text=${encodeURIComponent(texto)}`, '_blank');
    await api.put(`/citas/${r.citaId}`, { confirmPedida: new Date().toISOString() });
    avisarCitasCambiadas();
    setResultado(null);
  }

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 84, zIndex: 500 }}>
      {abierto && (
        <div
          className="card"
          style={{ width: 380, maxWidth: 'calc(100vw - 36px)', maxHeight: '72vh', overflowY: 'auto', marginBottom: 10, boxShadow: '0 12px 32px rgba(36,42,77,.25)' }}
        >
          <div className="entre">
            <h3>✨ Aura</h3>
            <button type="button" className="btn gh sm" onClick={() => setAbierto(false)}>
              Minimizar
            </button>
          </div>
          <p className="mini">Tu asistente de voz. Pulsa el micrófono y habla, o escríbelo abajo.</p>
          <div className="fila" style={{ marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className={`btn ${escuchando ? 'dan' : 'pri'}`} onClick={escuchando ? detenerEscucha : iniciarEscuchaUnica}>
              {escuchando ? '🔴 Escuchando…' : '🎙 Hablar'}
            </button>
            <form onSubmit={enviarOrdenManual} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder='p. ej. "Cita a María el 12 de septiembre a las diez y media"'
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn gh">
                Enviar
              </button>
            </form>
          </div>
          {parcial && <p className="mini">“{parcial}”</p>}
          {cargando && <p className="mini">Interpretando…</p>}
          {error && (
            <p className="mini" style={{ color: 'var(--rojo)' }}>
              {error}
            </p>
          )}
          {exito && (
            <div style={{ marginTop: 8 }}>
              <p style={{ color: 'var(--verde)', fontWeight: 600 }}>✅ {exito}</p>
              <button type="button" className="btn gh sm" onClick={() => setExito(null)}>
                Cerrar
              </button>
            </div>
          )}
          {resultado && resultado.accion === 'disponibilidad' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              <p style={{ marginTop: 8 }}>
                <span className="tag info">{fechaCorta(resultado.fecha || hoyISO())}</span>
              </p>
              {resultado.libres.length > 0 ? (
                <p className="mini" style={{ marginTop: 6 }}>
                  Huecos libres: {resultado.libres.join(', ')}
                </p>
              ) : (
                <p className="mini" style={{ marginTop: 6 }}>
                  Sin huecos libres ese día.
                </p>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'consultar_citas' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              <p style={{ marginTop: 8 }}>
                <span className="tag info">{fechaCorta(resultado.fecha || hoyISO())}</span>
                {resultado.gabinete && <span className="tag" style={{ marginLeft: 6 }}>{resultado.gabinete.nombre}</span>}
                {resultado.dentista && <span className="tag" style={{ marginLeft: 6 }}>{resultado.dentista.nombre}</span>}
              </p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.citasDelDia.length === 0 ? (
                <p className="mini" style={{ marginTop: 6 }}>
                  Sin citas ese día.
                </p>
              ) : (
                <table style={{ marginTop: 8 }}>
                  <tbody>
                    {resultado.citasDelDia.map((c) => (
                      <tr key={c.id}>
                        <td className="mono" style={{ width: 52 }}>
                          {c.hora}
                        </td>
                        <td>
                          <b>{c.paciente}</b>
                          <div className="mini">{[c.motivo, c.dentista, c.gabinete].filter(Boolean).join(' · ')}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'confirmar_pendientes' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.pendientes.length === 0 ? (
                <p className="mini" style={{ marginTop: 6 }}>
                  No hay citas pendientes de confirmar en los próximos días.
                </p>
              ) : (
                <table style={{ marginTop: 8 }}>
                  <tbody>
                    {resultado.pendientes.map((p) => (
                      <tr key={p.id}>
                        <td className="mono" style={{ width: 96 }}>
                          {fechaCorta(p.fecha)}
                          <div className="mini">{p.hora}</div>
                        </td>
                        <td>{p.paciente}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'pedir_confirmacion' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.citaId && resultado.pacienteContacto && resultado.fecha && resultado.hora && (
                <>
                  <p style={{ marginTop: 8 }}>
                    <b>
                      {resultado.pacienteContacto.nombre} {resultado.pacienteContacto.apellidos}
                    </b>{' '}
                    <span className="tag info">
                      {fechaCorta(resultado.fecha)} · {resultado.hora}
                    </span>
                  </p>
                  <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                    <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                      Cerrar
                    </button>
                    {resultado.pacienteContacto.telefono && (
                      <button type="button" className="btn pri" onClick={() => pedirConfirmacionWhatsApp(resultado)}>
                        Pedir confirmación por WhatsApp
                      </button>
                    )}
                  </div>
                </>
              )}
              {!(resultado.citaId && resultado.pacienteContacto) && (
                <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          )}
          {resultado && resultado.accion === 'crear_paciente' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.pacienteCreado && (
                <p style={{ marginTop: 8 }}>
                  <span className="tag ok">Creado</span>{' '}
                  <Link to={`/pacientes/${resultado.pacienteCreado.id}`} onClick={() => setAbierto(false)}>
                    {resultado.pacienteCreado.nombre} {resultado.pacienteCreado.apellidos}
                  </Link>
                </p>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && (resultado.accion === 'abrir_paciente' || resultado.accion === 'crear_presupuesto') && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.candidatos.length > 1 && (
                <table style={{ marginTop: 8 }}>
                  <tbody>
                    {resultado.candidatos.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link
                            to={resultado.accion === 'crear_presupuesto' ? `/presupuestos?paciente=${c.id}` : `/pacientes/${c.id}`}
                            onClick={() => setAbierto(false)}
                          >
                            {c.nombre} {c.apellidos}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {resultado.pacienteAbrir && (
                <p style={{ marginTop: 8 }}>
                  Abriendo la ficha de{' '}
                  <Link
                    to={resultado.accion === 'crear_presupuesto' ? `/presupuestos?paciente=${resultado.pacienteAbrir.id}` : `/pacientes/${resultado.pacienteAbrir.id}`}
                    onClick={() => setAbierto(false)}
                  >
                    {resultado.pacienteAbrir.nombre} {resultado.pacienteAbrir.apellidos}
                  </Link>
                  …
                </p>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'registrar_cobro' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.cobroRegistrado && (
                <p style={{ marginTop: 8 }}>
                  <span className="tag ok">Registrado</span> {resultado.cobroRegistrado.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} ·{' '}
                  {resultado.cobroRegistrado.paciente} · {resultado.cobroRegistrado.forma}
                </p>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'generar_acceso' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.accesoUrl && (
                <>
                  <div className="f" style={{ marginTop: 8 }}>
                    <input readOnly value={resultado.accesoUrl} onFocus={(e) => e.target.select()} />
                  </div>
                  <div className="fila" style={{ marginTop: 6 }}>
                    <button type="button" className="btn gh sm" onClick={() => navigator.clipboard?.writeText(resultado.accesoUrl || '')}>
                      Copiar enlace
                    </button>
                    {resultado.pacienteContacto?.telefono && (
                      <a
                        className="btn pri sm"
                        style={{ textDecoration: 'none' }}
                        target="_blank"
                        rel="noreferrer"
                        href={`https://wa.me/${resultado.pacienteContacto.telefono.replace(/[^\d]/g, '')}?text=${encodeURIComponent(`Aquí tienes tu acceso: ${resultado.accesoUrl}`)}`}
                      >
                        Enviar por WhatsApp
                      </a>
                    )}
                  </div>
                </>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'registrar_historia' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.historiaRegistrada && (
                <p style={{ marginTop: 8 }}>
                  <span className="tag ok">Anotado</span> {resultado.historiaRegistrada.acto} · {resultado.historiaRegistrada.paciente}
                </p>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'actualizar_odontograma' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.odontogramaActualizado && (
                <p style={{ marginTop: 8 }}>
                  <span className="tag ok">Actualizado</span> pieza {resultado.odontogramaActualizado.pieza} → {resultado.odontogramaActualizado.estado} ·{' '}
                  {resultado.odontogramaActualizado.paciente}
                </p>
              )}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'otro' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              <p style={{ marginTop: 6, fontWeight: 600 }}>Perdona, no te he entendido bien. ¿Puedes repetirlo?</p>
              <p className="mini" style={{ marginTop: 6 }}>
                Puedo agendar/cambiar citas, decir la disponibilidad, pedir confirmación, crear o abrir un paciente,
                preparar un presupuesto, registrar un cobro, generar el acceso al portal, anotar en la historia clínica, o marcar el odontograma.
              </p>
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn pri" onClick={() => { setResultado(null); iniciarEscuchaUnica(); }}>
                  🎙 Repetir
                </button>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'mover_cita' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              <div className="grid g2" style={{ marginTop: 8 }}>
                <div className="f">
                  <label>Paciente</label>
                  <input value={resultado.candidatos[0] ? `${resultado.candidatos[0].nombre} ${resultado.candidatos[0].apellidos}` : resultado.paciente || '(no reconocido)'} disabled />
                </div>
                {resultado.citaOriginal && (
                  <div className="f">
                    <label>Cita actual</label>
                    <input value={`${fechaCorta(resultado.citaOriginal.fecha)} · ${resultado.citaOriginal.hora}`} disabled />
                  </div>
                )}
                {resultado.dentista && (
                  <div className="f">
                    <label>Profesional nuevo</label>
                    <input value={resultado.dentista.nombre} disabled />
                  </div>
                )}
                {resultado.gabinete && (
                  <div className="f">
                    <label>Gabinete nuevo</label>
                    <input value={resultado.gabinete.nombre} disabled />
                  </div>
                )}
              </div>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {resultado.citaId && resultado.fecha && resultado.hora && (
                <div style={{ marginTop: 8 }}>
                  {resultado.disponible ? (
                    <span className="tag ok">
                      Nuevo: {fechaCorta(resultado.fecha)} a las {resultado.hora} · hueco libre
                    </span>
                  ) : (
                    <>
                      <span className="tag bad">
                        Nuevo: {fechaCorta(resultado.fecha)} a las {resultado.hora} · ocupado
                      </span>
                      {resultado.libres.length > 0 && (
                        <p className="mini" style={{ marginTop: 6 }}>
                          Libres ese día:{' '}
                          {resultado.libres.map((h) => (
                            <button
                              key={h}
                              type="button"
                              className="btn gh sm"
                              style={{ marginRight: 4, marginBottom: 4 }}
                              onClick={() => setResultado((r) => (r ? { ...r, hora: h, disponible: true } : r))}
                            >
                              {h}
                            </button>
                          ))}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {esperandoConfirmacion && <p className="tag info">🔊 Esperando tu respuesta — di "sí" para confirmar o "cancela" para descartar…</p>}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Descartar
                </button>
                <button type="button" className="btn pri" disabled={!resultado.citaId || !resultado.fecha || !resultado.hora} onClick={confirmarResultado}>
                  Confirmar cambio
                </button>
              </div>
            </div>
          )}
          {resultado && resultado.accion === 'agendar' && (
            <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
              <p className="mini">Escuché: “{resultado.texto}”</p>
              <div className="grid g2" style={{ marginTop: 8 }}>
                <div className="f">
                  <label>Paciente</label>
                  {resultado.candidatos.length > 0 ? (
                    <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}>
                      <option value="">{resultado.paciente} (nuevo / sin ficha)</option>
                      {resultado.candidatos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.apellidos}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={resultado.paciente || '(no reconocido)'} disabled />
                  )}
                </div>
                <div className="f">
                  <label>Motivo</label>
                  <input value={resultado.motivo || ''} disabled />
                </div>
                {resultado.dentista && (
                  <div className="f">
                    <label>Profesional</label>
                    <input value={resultado.dentista.nombre} disabled />
                  </div>
                )}
                {resultado.gabinete && (
                  <div className="f">
                    <label>Gabinete</label>
                    <input value={resultado.gabinete.nombre} disabled />
                  </div>
                )}
              </div>
              {resultado.avisos.map((a, i) => (
                <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                  {a}
                </p>
              ))}
              {!resultado.fecha || !resultado.hora ? (
                <p className="mini" style={{ marginTop: 8 }}>
                  No he encontrado ningún hueco libre en el próximo mes con esos criterios.
                </p>
              ) : resultado.disponible ? (
                <p style={{ marginTop: 8 }}>
                  <span className="tag ok">
                    {fechaCorta(resultado.fecha)} a las {resultado.hora} · hueco libre
                  </span>
                </p>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <span className="tag bad">
                    {fechaCorta(resultado.fecha)} a las {resultado.hora} · ocupado
                  </span>
                  {resultado.libres.length > 0 && (
                    <p className="mini" style={{ marginTop: 6 }}>
                      Libres ese día:{' '}
                      {resultado.libres.map((h) => (
                        <button
                          key={h}
                          type="button"
                          className="btn gh sm"
                          style={{ marginRight: 4, marginBottom: 4 }}
                          onClick={() => setResultado((r) => (r ? { ...r, hora: h, disponible: true } : r))}
                        >
                          {h}
                        </button>
                      ))}
                    </p>
                  )}
                </div>
              )}
              {esperandoConfirmacion && <p className="tag info">🔊 Esperando tu respuesta — di "sí" para confirmar o "cancela" para descartar…</p>}
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setResultado(null)}>
                  Descartar
                </button>
                <button type="button" className="btn pri" disabled={!resultado.fecha || !resultado.hora} onClick={confirmarResultado}>
                  Confirmar y agendar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        title="Aura, tu asistente de voz"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: escuchando ? 'var(--rojo)' : 'var(--marca)',
          color: '#fff',
          fontSize: 22,
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(36,42,77,.3)',
        }}
      >
        {abierto ? '✕' : '✨'}
      </button>
    </div>
  );
}
