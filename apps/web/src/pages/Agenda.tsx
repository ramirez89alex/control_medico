import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hoyISO, sumarDiasISO } from '@powerdent/shared';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/Modal';

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
}

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
  const [labVencido, setLabVencido] = useState(0);
  const [cobradoMes, setCobradoMes] = useState(0);

  const [vozEscuchando, setVozEscuchando] = useState(false);
  const [vozParcial, setVozParcial] = useState('');
  const [vozManual, setVozManual] = useState('');
  const [vozCargando, setVozCargando] = useState(false);
  const [vozError, setVozError] = useState<string | null>(null);
  const [vozResultado, setVozResultado] = useState<ResultadoVoz | null>(null);
  const [vozPacienteId, setVozPacienteId] = useState('');
  const [vozEsperandoConfirmacion, setVozEsperandoConfirmacion] = useState(false);
  const reconocimientoRef = useRef<any>(null);
  const reconocimientoConfirmRef = useRef<any>(null);
  const vozActivaRef = useRef(false);
  const vozPausadoRef = useRef(false);

  useEffect(() => {
    return () => {
      vozActivaRef.current = false;
      try {
        reconocimientoRef.current?.stop();
        reconocimientoConfirmRef.current?.stop();
        window.speechSynthesis?.cancel();
      } catch {
        /* ignorar */
      }
    };
  }, []);

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

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  useEffect(() => {
    api.get<Paciente[]>('/pacientes').then(setPacientes);
    api.get<Dentista[]>('/catalogos/dentistas').then(setDentistas);
    api.get<Gabinete[]>('/catalogos/gabinetes').then(setGabinetes);
    cargarRecordatorios();

    api.get<Array<{ estado: string; fechaPrevista: string }>>('/laboratorio').then((trabajos) => {
      const hoy = hoyISO();
      setLabVencido(trabajos.filter((t) => t.estado !== 'entregado' && t.fechaPrevista.slice(0, 10) < hoy).length);
    });
    api.get<Array<{ importe: number }>>(`/cobros?mes=${hoyISO().slice(0, 7)}`).then((cobros) => {
      setCobradoMes(cobros.reduce((a, c) => a + c.importe, 0));
    });
  }, []);

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

  async function marcarConfirmada(c: Cita, val: boolean) {
    await api.put(`/citas/${c.id}`, { confirmada: val });
    cargarRecordatorios();
    if (c.fecha === fecha) cargar();
  }

  function hablar(texto: string, alTerminar?: () => void) {
    if (!('speechSynthesis' in window)) {
      alTerminar?.();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = 1.05;
    if (alTerminar) {
      u.onend = alTerminar;
      u.onerror = alTerminar;
    }
    window.speechSynthesis.speak(u);
  }

  async function reservarDesdeVoz(r: ResultadoVoz, pacienteId: string) {
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
        pacienteId: pacienteId || undefined,
        nombreLibre: pacienteId ? undefined : r.paciente || undefined,
        fecha: r.fecha,
        hora: r.hora,
        duracionMin: 30,
        dentistaId: r.dentista?.id || undefined,
        gabineteId: r.gabinete?.id || undefined,
        motivo: r.motivo || undefined,
      });
    }
    setVozResultado(null);
    cargar();
    cargarRecordatorios();
  }

  function escucharConfirmacion(r: ResultadoVoz, pacienteId: string) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const reanudarContinuo = vozActivaRef.current;
    if (reanudarContinuo) {
      vozPausadoRef.current = true;
      try {
        reconocimientoRef.current?.stop();
      } catch {
        /* ignorar */
      }
    }
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const dicho = sinAcentos((e.results[0]?.[0]?.transcript || '').toLowerCase());
      if (/\b(si|confirma|confirmar|vale|correcto|adelante|dale)\b/.test(dicho)) {
        reservarDesdeVoz(r, pacienteId).then(() => hablar('Cita agendada.'));
      } else if (/\b(no|cancela|cancelar|descarta|descartar)\b/.test(dicho)) {
        setVozResultado(null);
        hablar('Vale, cancelado.');
      } else {
        hablar('No te he entendido. Puedes confirmar o descartar con los botones en pantalla.');
      }
    };
    const terminar = () => {
      setVozEsperandoConfirmacion(false);
      vozPausadoRef.current = false;
      if (reanudarContinuo && vozActivaRef.current) iniciarReconocimientoContinuo();
    };
    rec.onend = terminar;
    reconocimientoConfirmRef.current = rec;
    setVozEsperandoConfirmacion(true);
    try {
      rec.start();
    } catch {
      terminar();
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
      hablar(
        'No he entendido esa orden. Puedo agendar o cambiar citas, decirte la disponibilidad, pedir confirmación, crear o abrir la ficha de un paciente, preparar un presupuesto, registrar un cobro, generar el acceso al portal, anotar en la historia clínica, o marcar el odontograma.',
      );
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
      hablar(preguntaMover, () => escucharConfirmacion(r, pacienteIdMover));
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
    const pacienteId = r.candidatos.length === 1 ? r.candidatos[0].id : '';
    const nombrePaciente = r.candidatos[0] ? `${r.candidatos[0].nombre} ${r.candidatos[0].apellidos}` : r.paciente || 'el paciente';
    const conDentista = r.dentista ? ` con ${r.dentista.nombre}` : '';
    const enGabinete = r.gabinete ? ` en ${r.gabinete.nombre}` : '';
    const avisoHablado = r.avisos.length ? ` ${r.avisos.join(' ')}` : '';
    const pregunta = `¿Agendo la cita de ${nombrePaciente}${conDentista}${enGabinete} el ${fechaHablada(r.fecha)} a ${horaHablada(r.hora)}${r.motivo ? `, ${r.motivo}` : ''}?${avisoHablado} Di sí para confirmar, o cancela para descartar.`;
    hablar(pregunta, () => escucharConfirmacion(r, pacienteId));
  }

  async function interpretarVoz(texto: string) {
    setVozCargando(true);
    setVozError(null);
    setVozResultado(null);
    try {
      const r = await api.post<ResultadoVoz>('/voz/interpretar-cita', { texto });
      setVozResultado(r);
      setVozPacienteId(r.candidatos.length === 1 ? r.candidatos[0].id : '');
      anunciarResultado(r);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : 'No se pudo interpretar la orden';
      setVozError(mensaje);
      hablar(mensaje);
    } finally {
      setVozCargando(false);
    }
  }

  const PALABRA_CLAVE_RE = /^(power ?dent|power|asistente|doctor)\b[,:]?\s*/i;

  function iniciarReconocimientoContinuo() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVozError('Este navegador no reconoce voz. Usa Chrome o Edge, o escribe la orden abajo.');
      vozActivaRef.current = false;
      setVozEscuchando(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let fin = '';
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else parcial += r[0].transcript;
      }
      if (parcial) setVozParcial(parcial);
      const dicho = fin.trim();
      if (dicho) {
        setVozParcial('');
        if (PALABRA_CLAVE_RE.test(dicho)) {
          const orden = dicho.replace(PALABRA_CLAVE_RE, '').trim();
          if (orden) interpretarVoz(orden);
        }
        // si no empieza por la palabra clave ("Power…"), se ignora en silencio
      }
    };
    rec.onerror = (ev: any) => {
      if (ev.error === 'not-allowed') {
        setVozError('Permiso de micrófono denegado.');
        vozActivaRef.current = false;
      }
      // otros errores (sin voz, red…) los recoge onend, que reintenta si sigue activo
    };
    rec.onend = () => {
      if (vozActivaRef.current && !vozPausadoRef.current) {
        try {
          rec.start();
        } catch {
          /* ya iniciado */
        }
      } else {
        setVozEscuchando(false);
      }
    };
    reconocimientoRef.current = rec;
    try {
      rec.start();
      setVozEscuchando(true);
    } catch {
      setVozEscuchando(false);
    }
  }

  function alternarAsistente() {
    if (vozActivaRef.current) {
      vozActivaRef.current = false;
      try {
        reconocimientoRef.current?.stop();
      } catch {
        /* ignorar */
      }
      setVozEscuchando(false);
      return;
    }
    vozActivaRef.current = true;
    setVozError(null);
    iniciarReconocimientoContinuo();
  }

  function enviarOrdenManual(e: FormEvent) {
    e.preventDefault();
    const texto = vozManual.trim();
    if (!texto) return;
    setVozManual('');
    interpretarVoz(texto);
  }

  async function confirmarVoz() {
    if (!vozResultado || !vozResultado.fecha || !vozResultado.hora) return;
    await reservarDesdeVoz(vozResultado, vozPacienteId);
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
          onClick={(e) => {
            e.stopPropagation();
            setModalCita(c);
          }}
        >
          ⋯
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

      <div className="card">
        <div className="entre">
          <h3>Asistente de voz</h3>
          <span className="mini">{vozEscuchando ? 'Activo — empieza con "Power…"' : 'Actívalo y di "Power, ..." — o escríbelo abajo'}</span>
        </div>
        <div className="fila" style={{ marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className={`btn ${vozEscuchando ? 'dan' : 'pri'}`} onClick={alternarAsistente}>
            {vozEscuchando ? '🔴 Asistente activo' : '🎙 Activar asistente'}
          </button>
          <form onSubmit={enviarOrdenManual} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 260 }}>
            <input
              value={vozManual}
              onChange={(e) => setVozManual(e.target.value)}
              placeholder='p. ej. "Cita a María el 12 de septiembre a las diez y media, revisión"'
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn gh">
              Enviar
            </button>
          </form>
        </div>
        {vozParcial && <p className="mini">“{vozParcial}”</p>}
        {vozCargando && <p className="mini">Interpretando…</p>}
        {vozError && (
          <p className="mini" style={{ color: 'var(--rojo)' }}>
            {vozError}
          </p>
        )}
        {vozResultado && vozResultado.accion === 'disponibilidad' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            <p style={{ marginTop: 8 }}>
              <span className="tag info">{fechaCorta(vozResultado.fecha || fecha)}</span>
            </p>
            {vozResultado.libres.length > 0 ? (
              <p className="mini" style={{ marginTop: 6 }}>
                Huecos libres: {vozResultado.libres.join(', ')}
              </p>
            ) : (
              <p className="mini" style={{ marginTop: 6 }}>
                Sin huecos libres ese día.
              </p>
            )}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'confirmar_pendientes' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.pendientes.length === 0 ? (
              <p className="mini" style={{ marginTop: 6 }}>
                No hay citas pendientes de confirmar en los próximos días.
              </p>
            ) : (
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {vozResultado.pendientes.map((p) => (
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
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'pedir_confirmacion' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.citaId && vozResultado.pacienteContacto && vozResultado.fecha && vozResultado.hora && (
              <>
                <p style={{ marginTop: 8 }}>
                  <b>
                    {vozResultado.pacienteContacto.nombre} {vozResultado.pacienteContacto.apellidos}
                  </b>{' '}
                  <span className="tag info">
                    {fechaCorta(vozResultado.fecha)} · {vozResultado.hora}
                  </span>
                </p>
                <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                    Cerrar
                  </button>
                  {vozResultado.pacienteContacto.telefono && (
                    <button
                      type="button"
                      className="btn pri"
                      onClick={() => {
                        const r = vozResultado;
                        if (!r || !r.citaId || !r.pacienteContacto || !r.fecha || !r.hora) return;
                        pedirConfirmacion({
                          id: r.citaId,
                          fecha: r.fecha,
                          hora: r.hora,
                          motivo: r.motivo,
                          paciente: { id: '', nombre: r.pacienteContacto.nombre, apellidos: r.pacienteContacto.apellidos, telefono: r.pacienteContacto.telefono, consentFirmaArchivoId: null },
                          dentista: null,
                        });
                        setVozResultado(null);
                      }}
                    >
                      Pedir confirmación por WhatsApp
                    </button>
                  )}
                </div>
              </>
            )}
            {!(vozResultado.citaId && vozResultado.pacienteContacto) && (
              <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                  Cerrar
                </button>
              </div>
            )}
          </div>
        )}
        {vozResultado && vozResultado.accion === 'crear_paciente' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.pacienteCreado && (
              <p style={{ marginTop: 8 }}>
                <span className="tag ok">Creado</span>{' '}
                <Link to={`/pacientes/${vozResultado.pacienteCreado.id}`}>
                  {vozResultado.pacienteCreado.nombre} {vozResultado.pacienteCreado.apellidos}
                </Link>
              </p>
            )}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && (vozResultado.accion === 'abrir_paciente' || vozResultado.accion === 'crear_presupuesto') && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.candidatos.length > 1 && (
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {vozResultado.candidatos.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={vozResultado.accion === 'crear_presupuesto' ? `/presupuestos?paciente=${c.id}` : `/pacientes/${c.id}`}>
                          {c.nombre} {c.apellidos}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {vozResultado.pacienteAbrir && (
              <p style={{ marginTop: 8 }}>
                Abriendo la ficha de{' '}
                <Link to={vozResultado.accion === 'crear_presupuesto' ? `/presupuestos?paciente=${vozResultado.pacienteAbrir.id}` : `/pacientes/${vozResultado.pacienteAbrir.id}`}>
                  {vozResultado.pacienteAbrir.nombre} {vozResultado.pacienteAbrir.apellidos}
                </Link>
                …
              </p>
            )}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'registrar_cobro' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.cobroRegistrado && (
              <p style={{ marginTop: 8 }}>
                <span className="tag ok">Registrado</span> {vozResultado.cobroRegistrado.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} ·{' '}
                {vozResultado.cobroRegistrado.paciente} · {vozResultado.cobroRegistrado.forma}
              </p>
            )}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'generar_acceso' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.accesoUrl && (
              <>
                <div className="f" style={{ marginTop: 8 }}>
                  <input readOnly value={vozResultado.accesoUrl} onFocus={(e) => e.target.select()} />
                </div>
                <div className="fila" style={{ marginTop: 6 }}>
                  <button type="button" className="btn gh sm" onClick={() => navigator.clipboard?.writeText(vozResultado.accesoUrl || '')}>
                    Copiar enlace
                  </button>
                  {vozResultado.pacienteContacto?.telefono && (
                    <a
                      className="btn pri sm"
                      style={{ textDecoration: 'none' }}
                      target="_blank"
                      rel="noreferrer"
                      href={`https://wa.me/${vozResultado.pacienteContacto.telefono.replace(/[^\d]/g, '')}?text=${encodeURIComponent(`Aquí tienes tu acceso: ${vozResultado.accesoUrl}`)}`}
                    >
                      Enviar por WhatsApp
                    </a>
                  )}
                </div>
              </>
            )}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'registrar_historia' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.historiaRegistrada && (
              <p style={{ marginTop: 8 }}>
                <span className="tag ok">Anotado</span> {vozResultado.historiaRegistrada.acto} · {vozResultado.historiaRegistrada.paciente}
              </p>
            )}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'actualizar_odontograma' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.odontogramaActualizado && (
              <p style={{ marginTop: 8 }}>
                <span className="tag ok">Actualizado</span> pieza {vozResultado.odontogramaActualizado.pieza} → {vozResultado.odontogramaActualizado.estado} ·{' '}
                {vozResultado.odontogramaActualizado.paciente}
              </p>
            )}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'otro' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            <p className="mini" style={{ marginTop: 6 }}>
              No he entendido esa orden. Puedo agendar/cambiar citas, decir la disponibilidad, pedir confirmación, crear o abrir un paciente,
              preparar un presupuesto, registrar un cobro, generar el acceso al portal, anotar en la historia clínica, o marcar el odontograma.
            </p>
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'mover_cita' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            <div className="grid g2" style={{ marginTop: 8 }}>
              <div className="f">
                <label>Paciente</label>
                <input value={vozResultado.candidatos[0] ? `${vozResultado.candidatos[0].nombre} ${vozResultado.candidatos[0].apellidos}` : vozResultado.paciente || '(no reconocido)'} disabled />
              </div>
              {vozResultado.citaOriginal && (
                <div className="f">
                  <label>Cita actual</label>
                  <input value={`${fechaCorta(vozResultado.citaOriginal.fecha)} · ${vozResultado.citaOriginal.hora}`} disabled />
                </div>
              )}
              {vozResultado.dentista && (
                <div className="f">
                  <label>Profesional nuevo</label>
                  <input value={vozResultado.dentista.nombre} disabled />
                </div>
              )}
              {vozResultado.gabinete && (
                <div className="f">
                  <label>Gabinete nuevo</label>
                  <input value={vozResultado.gabinete.nombre} disabled />
                </div>
              )}
            </div>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {vozResultado.citaId && vozResultado.fecha && vozResultado.hora && (
              <div style={{ marginTop: 8 }}>
                {vozResultado.disponible ? (
                  <span className="tag ok">
                    Nuevo: {fechaCorta(vozResultado.fecha)} a las {vozResultado.hora} · hueco libre
                  </span>
                ) : (
                  <>
                    <span className="tag bad">
                      Nuevo: {fechaCorta(vozResultado.fecha)} a las {vozResultado.hora} · ocupado
                    </span>
                    {vozResultado.libres.length > 0 && (
                      <p className="mini" style={{ marginTop: 6 }}>
                        Libres ese día:{' '}
                        {vozResultado.libres.map((h) => (
                          <button
                            key={h}
                            type="button"
                            className="btn gh sm"
                            style={{ marginRight: 4, marginBottom: 4 }}
                            onClick={() => setVozResultado((r) => (r ? { ...r, hora: h, disponible: true } : r))}
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
            {vozEsperandoConfirmacion && <p className="tag info">🔊 Esperando tu respuesta — di "sí" para confirmar o "cancela" para descartar…</p>}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Descartar
              </button>
              <button
                type="button"
                className="btn pri"
                disabled={!vozResultado.citaId || !vozResultado.fecha || !vozResultado.hora}
                onClick={confirmarVoz}
              >
                Confirmar cambio
              </button>
            </div>
          </div>
        )}
        {vozResultado && vozResultado.accion === 'agendar' && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--linea)', paddingTop: 10 }}>
            <p className="mini">Escuché: “{vozResultado.texto}”</p>
            <div className="grid g2" style={{ marginTop: 8 }}>
              <div className="f">
                <label>Paciente</label>
                {vozResultado.candidatos.length > 0 ? (
                  <select value={vozPacienteId} onChange={(e) => setVozPacienteId(e.target.value)}>
                    <option value="">{vozResultado.paciente} (nuevo / sin ficha)</option>
                    {vozResultado.candidatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.apellidos}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={vozResultado.paciente || '(no reconocido)'} disabled />
                )}
              </div>
              <div className="f">
                <label>Motivo</label>
                <input value={vozResultado.motivo || ''} disabled />
              </div>
              {vozResultado.dentista && (
                <div className="f">
                  <label>Profesional</label>
                  <input value={vozResultado.dentista.nombre} disabled />
                </div>
              )}
              {vozResultado.gabinete && (
                <div className="f">
                  <label>Gabinete</label>
                  <input value={vozResultado.gabinete.nombre} disabled />
                </div>
              )}
            </div>
            {vozResultado.avisos.map((a, i) => (
              <p className="mini" key={i} style={{ color: 'var(--tenue)' }}>
                {a}
              </p>
            ))}
            {!vozResultado.fecha || !vozResultado.hora ? (
              <p className="mini" style={{ marginTop: 8 }}>
                No he encontrado ningún hueco libre en el próximo mes con esos criterios.
              </p>
            ) : vozResultado.disponible ? (
              <p style={{ marginTop: 8 }}>
                <span className="tag ok">
                  {fechaCorta(vozResultado.fecha)} a las {vozResultado.hora} · hueco libre
                </span>
              </p>
            ) : (
              <div style={{ marginTop: 8 }}>
                <span className="tag bad">
                  {fechaCorta(vozResultado.fecha)} a las {vozResultado.hora} · ocupado
                </span>
                {vozResultado.libres.length > 0 && (
                  <p className="mini" style={{ marginTop: 6 }}>
                    Libres ese día:{' '}
                    {vozResultado.libres.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className="btn gh sm"
                        style={{ marginRight: 4, marginBottom: 4 }}
                        onClick={() => setVozResultado((r) => (r ? { ...r, hora: h, disponible: true } : r))}
                      >
                        {h}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            )}
            {vozEsperandoConfirmacion && <p className="tag info">🔊 Esperando tu respuesta — di "sí" para confirmar o "cancela" para descartar…</p>}
            <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn gh" onClick={() => setVozResultado(null)}>
                Descartar
              </button>
              <button type="button" className="btn pri" disabled={!vozResultado.fecha || !vozResultado.hora} onClick={confirmarVoz}>
                Confirmar y agendar
              </button>
            </div>
          </div>
        )}
      </div>

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
          <span className="mini">Toca una cita para abrir la ficha del paciente · toca ⋯ para editarla</span>
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
            <select name="gabineteId" defaultValue={cita?.gabinete?.id || ''}>
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
            <select name="dentistaId" defaultValue={cita?.dentista?.id || ''}>
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
