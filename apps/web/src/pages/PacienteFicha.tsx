import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { hoyISO, pendientePaciente, saldoPaciente, totalPresupuesto } from '@powerdent/shared';
import type { LineaPresupuesto } from '@powerdent/shared';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { FirmaCanvas } from '../components/FirmaCanvas';
import { subirArchivo } from '../lib/archivos';
import { textoLegal } from '../lib/legal';

interface Archivo {
  id: string;
  nombre: string;
  mime: string;
  tamanoBytes: number;
  createdAt: string;
}

interface HistoriaEntrada {
  id: string;
  fecha: string;
  acto: string;
  piezas: string | null;
  nota: string;
  audioArchivoId: string | null;
}

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  nacimiento: string | null;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  alergias: string | null;
  medicacion: string | null;
  antecedentes: string | null;
  aviso: string | null;
  origen: string | null;
  doctorId: string | null;
  consentDatosAceptado: boolean;
  consentTratamientoAceptado: boolean;
  consentImagenesAceptado: boolean;
  consentComercialAceptado: boolean;
  consentFirmaArchivoId: string | null;
  consentFecha: string | null;
  odontograma: Record<string, string>;
  notasOdontograma: string | null;
  createdAt: string;
  archivos: Archivo[];
  historiaClinica: HistoriaEntrada[];
}

interface Dentista {
  id: string;
  nombre: string;
}

interface Cita {
  id: string;
  fecha: string;
  hora: string;
  motivo: string | null;
  estado: string;
  confirmada: boolean;
  dentista: { nombre: string } | null;
}

interface LineaApi {
  id: string;
  codigo: string;
  nombre: string;
  pieza: string | null;
  cantidad: number;
  pvp: number;
  coste: number;
}

interface Presupuesto {
  id: string;
  fecha: string;
  estado: 'borrador' | 'enviado' | 'aceptado' | 'rechazado';
  descuentoPct: number;
  lineas: LineaApi[];
}

interface Cobro {
  id: string;
  fecha: string;
  importe: number;
  forma: string;
  tipo: string;
  concepto: string | null;
}

interface Clinica {
  nombre: string;
  nif: string | null;
  direccion: string | null;
  cp: string | null;
  ciudad: string | null;
  email: string | null;
}

interface Material {
  id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  coste: number;
}

interface ConsumoMaterial {
  id: string;
  fecha: string;
  cantidad: number;
  coste: number;
  material: Material;
}

interface Trabajo {
  id: string;
  nombreLab: string | null;
  tipo: string;
  trabajo: string | null;
  fechaEnvio: string;
  fechaPrevista: string;
  coste: number;
  estado: 'enviado' | 'recibido' | 'entregado';
}

type Tab = '360' | 'datos' | 'historia' | 'odontograma' | 'presupuestos' | 'cobros' | 'laboratorio' | 'material' | 'archivos';

const FORMAS: Record<string, string> = {
  tarjeta: 'Tarjeta',
  efectivo: 'Efectivo',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  enlace_pago: 'Enlace de pago',
  financiacion: 'Financiación',
  seguro: 'Seguro',
};

const TAG_ESTADO_PRESU: Record<string, string> = {
  borrador: 'tag',
  enviado: 'tag info',
  aceptado: 'tag ok',
  rechazado: 'tag bad',
};

const TAG_ESTADO_LAB: Record<string, string> = {
  enviado: 'tag warn',
  recibido: 'tag info',
  entregado: 'tag ok',
};

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

const SUP_DIENTES = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const INF_DIENTES = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

/** Mismo orden que ESTADOS_DIENTE en el backend (pacientes.ts) — para la actualización optimista. */
const ESTADOS_DIENTE = ['', 'caries', 'obturado', 'endo', 'corona', 'implante', 'ausente'] as const;

/**
 * Posición de una pieza a lo largo de un arco dental. `arco` es el radio de la
 * circunferencia; las piezas centrales (incisivos) quedan en la punta del arco y las
 * laterales (molares) se abren hacia los lados, igual que un odontograma en forma de
 * herradura. "arriba" = maxilar (arco que cae hacia los lados desde el centro), "abajo" =
 * mandíbula (arco que sube hacia los lados desde el centro) — misma profundidad (sagita)
 * en los dos, solo espejada, para que ambas filas midan igual de alto.
 */
const ANGULO_MAX_ARCO = 72;
function alturaArco(radio: number) {
  return radio * (1 - Math.cos((ANGULO_MAX_ARCO * Math.PI) / 180));
}
function posicionArco(indice: number, total: number, radio: number, arriba: boolean) {
  const t = total > 1 ? indice / (total - 1) : 0.5;
  const anguloGrados = -ANGULO_MAX_ARCO + 2 * ANGULO_MAX_ARCO * t;
  const anguloRad = (anguloGrados * Math.PI) / 180;
  const x = radio * Math.sin(anguloRad);
  const sagita = radio * (1 - Math.cos(anguloRad));
  const y = arriba ? sagita : alturaArco(radio) - sagita;
  return { left: `calc(50% + ${x}px)`, top: `${y}px` };
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES');
}

function mapLineas(lineas: LineaApi[]): LineaPresupuesto[] {
  return lineas.map((l) => ({ id: l.id, cod: l.codigo, n: l.nombre, pieza: l.pieza, cant: l.cantidad, pvp: l.pvp, coste: l.coste }));
}

function AudioSesion({ archivoId }: { archivoId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ url: string }>(`/archivos/${archivoId}/descarga`).then((r) => setUrl(r.url));
  }, [archivoId]);

  if (!url) return null;
  return <audio controls src={url} style={{ display: 'block', marginTop: 6, maxWidth: '100%' }} />;
}

export function PacienteFicha() {
  const { id } = useParams<{ id: string }>();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [dentistas, setDentistas] = useState<Dentista[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [laboratorios, setLaboratorios] = useState<Trabajo[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [consumosMaterial, setConsumosMaterial] = useState<ConsumoMaterial[]>([]);
  const [clinica, setClinica] = useState<Clinica | null>(null);
  const [tab, setTab] = useState<Tab>('360');
  const [reFirmando, setReFirmando] = useState(false);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null);
  const [enlaceAcceso, setEnlaceAcceso] = useState<string | null>(null);
  const [generandoAcceso, setGenerandoAcceso] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [modalCobro, setModalCobro] = useState(false);
  const [modalLab, setModalLab] = useState(false);

  const [grabando, setGrabando] = useState(false);
  const [segundosGrabados, setSegundosGrabados] = useState(0);
  const [mensajeGrabacion, setMensajeGrabacion] = useState('Micrófono listo');
  const [audioGrabado, setAudioGrabado] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function cargar() {
    if (!id) return;
    const [p, cs, ps, cb, lb, cm] = await Promise.all([
      api.get<Paciente>(`/pacientes/${id}`),
      api.get<Cita[]>(`/citas?pacienteId=${id}`),
      api.get<Presupuesto[]>(`/presupuestos?pacienteId=${id}`),
      api.get<Cobro[]>(`/cobros?pacienteId=${id}`),
      api.get<Trabajo[]>(`/laboratorio?pacienteId=${id}`),
      api.get<ConsumoMaterial[]>(`/materiales/consumos?pacienteId=${id}`),
    ]);
    setPaciente(p);
    setCitas(cs);
    setPresupuestos(ps);
    setCobros(cb);
    setLaboratorios(lb);
    setConsumosMaterial(cm);
    setReFirmando(false);
  }

  useEffect(() => {
    cargar();
    api.get<Dentista[]>('/catalogos/dentistas').then(setDentistas);
    api.get<Clinica>('/catalogos/clinica').then(setClinica);
    api.get<Material[]>('/materiales').then(setMateriales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!paciente?.consentFirmaArchivoId) {
      setFirmaUrl(null);
      return;
    }
    api.get<{ url: string }>(`/archivos/${paciente.consentFirmaArchivoId}/descarga`).then((r) => setFirmaUrl(r.url));
  }, [paciente?.consentFirmaArchivoId]);

  async function guardarCampo(campo: string, valor: string | null) {
    if (!id) return;
    await api.put(`/pacientes/${id}`, { [campo]: valor || null });
  }

  async function guardarConsent(campo: string, valor: boolean) {
    if (!id || !paciente) return;
    setPaciente({ ...paciente, [campo]: valor });
    await api.put(`/pacientes/${id}/consentimiento`, { [campo]: valor });
  }

  async function guardarFirma(blob: Blob) {
    if (!id || !paciente) return;
    if (!paciente.consentDatosAceptado || !paciente.consentTratamientoAceptado) {
      window.alert('Marca los dos consentimientos obligatorios antes de firmar.');
      return;
    }
    setGuardandoFirma(true);
    try {
      const archivo = await subirArchivo(blob, `firma-${id}.png`, id);
      await api.put(`/pacientes/${id}/consentimiento`, { consentFirmaArchivoId: archivo.id });
      await cargar();
    } catch {
      window.alert('No se pudo guardar la firma. Comprueba el almacenamiento de archivos e inténtalo de nuevo.');
    } finally {
      setGuardandoFirma(false);
    }
  }

  function alternarGrabacion() {
    if (grabando) {
      mediaRecorderRef.current?.stop();
      return;
    }
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => chunksRef.current.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (timerRef.current) clearInterval(timerRef.current);
          const blob = new Blob(chunksRef.current, { type: rec.mimeType });
          setAudioGrabado(blob);
          setMensajeGrabacion(`Audio listo · ${(blob.size / 1048576).toFixed(1)} MB — guarda la sesión`);
          setGrabando(false);
        };
        mediaRecorderRef.current = rec;
        rec.start();
        setSegundosGrabados(0);
        setGrabando(true);
        setAudioGrabado(null);
        setMensajeGrabacion('Grabando la sesión');
        timerRef.current = setInterval(() => setSegundosGrabados((s) => s + 1), 1000);
      })
      .catch(() => setMensajeGrabacion('Sin permiso de micrófono. Actívalo en el navegador.'));
  }

  async function anadirNota(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    let audioArchivoId: string | undefined;
    if (audioGrabado) {
      try {
        const archivo = await subirArchivo(audioGrabado, `sesion-${id}-${Date.now()}.webm`, id);
        audioArchivoId = archivo.id;
      } catch {
        window.alert('No se pudo subir el audio; se guarda la nota sin él.');
      }
    }
    const materialId = form.get('materialId');
    const cantidadMaterial = Number(form.get('cantidadMaterial')) || 0;
    await api.post(`/pacientes/${id}/historia`, {
      acto: form.get('acto'),
      piezas: form.get('piezas') || undefined,
      nota: form.get('nota'),
      audioArchivoId,
      materialId: materialId && cantidadMaterial > 0 ? materialId : undefined,
      cantidadMaterial: materialId && cantidadMaterial > 0 ? cantidadMaterial : undefined,
    });
    (e.target as HTMLFormElement).reset();
    setAudioGrabado(null);
    setMensajeGrabacion('Micrófono listo');
    if (materialId && cantidadMaterial > 0) api.get<Material[]>('/materiales').then(setMateriales);
    cargar();
  }

  async function anadirMaterial() {
    const nombre = window.prompt('Nombre del material (p. ej. "Composite A2", "Anestesia carpule")');
    if (!nombre) return;
    const coste = Number(window.prompt('Coste por unidad (€)', '0')) || 0;
    const cantidad = Number(window.prompt('Cantidad inicial en stock', '0')) || 0;
    const nuevo = await api.post<Material>('/materiales', { nombre, unidad: 'ud', coste, cantidad });
    setMateriales((m) => [...m, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  function ciclarDiente(pieza: number) {
    if (!id || !paciente) return;
    const actual = paciente.odontograma[pieza] || '';
    const siguiente = ESTADOS_DIENTE[(ESTADOS_DIENTE.indexOf(actual as (typeof ESTADOS_DIENTE)[number]) + 1) % ESTADOS_DIENTE.length];
    const odontogramaOptimista = { ...paciente.odontograma };
    if (siguiente) odontogramaOptimista[pieza] = siguiente;
    else delete odontogramaOptimista[pieza];
    // Actualización optimista: el color cambia al instante, sin esperar la respuesta del
    // servidor ni recargar citas/presupuestos/cobros/laboratorio (que no dependen de esto).
    setPaciente({ ...paciente, odontograma: odontogramaOptimista });
    api
      .post<Paciente>(`/pacientes/${id}/odontograma`, { pieza: String(pieza) })
      .then((actualizado) => setPaciente((p) => (p ? { ...p, odontograma: actualizado.odontograma } : p)))
      .catch(() => setPaciente((p) => (p ? { ...p, odontograma: paciente.odontograma } : p)));
  }

  async function registrarCobro(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post('/cobros', {
      pacienteId: id,
      fecha: new Date(`${form.get('fecha')}T00:00:00`).toISOString(),
      importe: Number(form.get('importe')),
      tipo: form.get('tipo'),
      forma: form.get('forma'),
      concepto: form.get('concepto') || undefined,
    });
    setModalCobro(false);
    cargar();
  }

  async function crearLab(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post('/laboratorio', {
      pacienteId: id,
      nombreLab: form.get('nombreLab') || undefined,
      tipo: form.get('tipo'),
      trabajo: form.get('trabajo') || undefined,
      piezas: form.get('piezas') || undefined,
      material: form.get('material') || undefined,
      fechaEnvio: new Date(`${form.get('fechaEnvio')}T00:00:00`).toISOString(),
      diasEntrega: Number(form.get('diasEntrega')) || 7,
      coste: Number(form.get('coste')) || 0,
    });
    setModalLab(false);
    cargar();
  }

  async function subirArchivos(files: FileList) {
    if (!id) return;
    setSubiendo(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 8_000_000) {
          window.alert(`${file.name} supera 8 MB — comprímelo antes de subirlo`);
          continue;
        }
        try {
          await subirArchivo(file, file.name, id);
        } catch {
          window.alert(`No se pudo subir ${file.name}. Comprueba el almacenamiento de archivos e inténtalo de nuevo.`);
        }
      }
      await cargar();
    } finally {
      setSubiendo(false);
    }
  }

  async function descargarArchivo(a: Archivo) {
    const { url } = await api.get<{ url: string }>(`/archivos/${a.id}/descarga`);
    window.open(url, '_blank');
  }

  async function borrarArchivo(a: Archivo) {
    if (!window.confirm(`¿Eliminar ${a.nombre}?`)) return;
    await api.del(`/archivos/${a.id}`);
    cargar();
  }

  async function generarAcceso() {
    if (!id) return;
    setGenerandoAcceso(true);
    try {
      const { url } = await api.post<{ url: string }>('/auth/paciente/generar', { pacienteId: id });
      setEnlaceAcceso(url);
    } finally {
      setGenerandoAcceso(false);
    }
  }

  if (!paciente) return <p className="vacio">Cargando…</p>;

  const presupuestosAceptados = presupuestos.filter((p) => p.estado === 'aceptado').map((p) => ({ lineas: mapLineas(p.lineas), dto: p.descuentoPct }));
  const saldo = saldoPaciente(presupuestosAceptados, cobros);
  const pendiente = pendientePaciente(presupuestosAceptados, cobros);
  const hoy = hoyISO();
  const proximaCita = citas.filter((c) => c.fecha >= hoy && c.estado !== 'cancelada').sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0];

  interface Evento {
    fecha: string;
    hora: string;
    tipo: string;
    clase: string;
    titulo: string;
    detalle?: string;
    importe?: number;
  }

  const eventos: Evento[] = [
    ...paciente.historiaClinica.map((h) => ({
      fecha: h.fecha.slice(0, 10),
      hora: '',
      tipo: 'Tratamiento',
      clase: 'trat',
      titulo: h.acto,
      detalle: h.piezas ? `pieza ${h.piezas}` : undefined,
    })),
    ...presupuestos.map((p) => ({
      fecha: p.fecha.slice(0, 10),
      hora: '',
      tipo: 'Presupuesto',
      clase: 'pres',
      titulo: p.lineas.map((l) => l.nombre).join(', ').slice(0, 90) || 'Presupuesto',
      detalle: p.estado,
      importe: totalPresupuesto(mapLineas(p.lineas), p.descuentoPct),
    })),
    ...cobros.map((c) => ({
      fecha: c.fecha.slice(0, 10),
      hora: '',
      tipo: c.tipo === 'anticipo' ? 'A cuenta' : 'Cobro',
      clase: 'cob',
      titulo: c.concepto || 'Pago',
      detalle: FORMAS[c.forma] || c.forma,
      importe: c.importe,
    })),
    ...citas.map((c) => ({
      fecha: c.fecha,
      hora: c.hora,
      tipo: 'Cita',
      clase: 'cita',
      titulo: c.motivo || 'Consulta',
      detalle: [c.dentista?.nombre, c.estado].filter(Boolean).join(' · '),
    })),
  ].sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

  return (
    <div>
      <div className="topbar">
        <div>
          <Link to="/pacientes" className="btn gh sm">
            ← Pacientes
          </Link>
          <h1 style={{ marginTop: 8 }}>
            {paciente.nombre} {paciente.apellidos}
          </h1>
          <p>
            {paciente.telefono || 'sin teléfono'} · alta {fechaCorta(paciente.createdAt)} · pendiente {eur(pendiente)}
            {paciente.alergias && (
              <>
                {' · '}
                <span className="tag bad">Alergias: {paciente.alergias}</span>
              </>
            )}
          </p>
          {proximaCita && (
            <div className="proxima">
              <b>Próxima cita:</b> {fechaCorta(`${proximaCita.fecha}T00:00:00`)} a las {proximaCita.hora} · {proximaCita.motivo || 'Consulta'}
              {proximaCita.confirmada ? <span className="tag ok">confirmada</span> : <span className="tag warn">sin confirmar</span>}
            </div>
          )}
        </div>
        <div className="acciones">
          <button className="btn gh" disabled={generandoAcceso} onClick={generarAcceso}>
            {generandoAcceso ? 'Generando…' : 'Generar acceso'}
          </button>
          <Link className="btn pri" style={{ textDecoration: 'none' }} to={`/presupuestos?paciente=${paciente.id}`}>
            Presupuesto rápido
          </Link>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === '360' ? 'on' : ''} onClick={() => setTab('360')}>
          Ficha 360
        </button>
        <button className={tab === 'datos' ? 'on' : ''} onClick={() => setTab('datos')}>
          Datos y RGPD
        </button>
        <button className={tab === 'historia' ? 'on' : ''} onClick={() => setTab('historia')}>
          Historia y audio
        </button>
        <button className={tab === 'odontograma' ? 'on' : ''} onClick={() => setTab('odontograma')}>
          Odontograma
        </button>
        <button className={tab === 'presupuestos' ? 'on' : ''} onClick={() => setTab('presupuestos')}>
          Presupuestos
        </button>
        <button className={tab === 'cobros' ? 'on' : ''} onClick={() => setTab('cobros')}>
          Cobros
        </button>
        <button className={tab === 'laboratorio' ? 'on' : ''} onClick={() => setTab('laboratorio')}>
          Laboratorio
        </button>
        <button className={tab === 'material' ? 'on' : ''} onClick={() => setTab('material')}>
          Material
        </button>
        <button className={tab === 'archivos' ? 'on' : ''} onClick={() => setTab('archivos')}>
          Archivos
        </button>
      </div>

      {tab === '360' && (
        <div>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <span>Aceptado</span>
              <b>{eur(saldo.facturado)}</b>
            </div>
            <div className="kpi">
              <span>Cobrado</span>
              <b>{eur(saldo.pagos)}</b>
            </div>
            <div className="kpi">
              <span>Pendiente</span>
              <b style={{ color: saldo.pendiente > 0.5 ? 'var(--marca)' : 'inherit' }}>{eur(saldo.pendiente)}</b>
            </div>
            <div className="kpi">
              <span>Visitas</span>
              <b>{paciente.historiaClinica.length}</b>
            </div>
          </div>

          <div className="card">
            <h3>Todo lo que ha pasado</h3>
            <p className="mini">Visitas, tratamientos, dinero y citas, en orden.</p>
            <hr />
            {eventos.length === 0 ? (
              <div className="vacio">Sin movimientos todavía.</div>
            ) : (
              <div className="linea">
                {eventos.map((e, i) => (
                  <div className={`ev ${e.clase}`} key={i}>
                    <div className="evf">
                      {fechaCorta(`${e.fecha}T00:00:00`)}
                      {e.hora && <small>{e.hora}</small>}
                    </div>
                    <div className="evc">
                      <span className="tag">{e.tipo}</span> <b>{e.titulo}</b>
                      {e.detalle && <div className="mini">{e.detalle}</div>}
                    </div>
                    <div className="evi">{e.importe !== undefined ? eur(e.importe) : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'datos' && (
        <div className="grid g2">
          <div className="card">
            <h3>Datos del paciente</h3>
            <hr />
            <div className="grid g2">
              <div className="f">
                <label>Nombre</label>
                <input defaultValue={paciente.nombre} onBlur={(e) => guardarCampo('nombre', e.target.value)} />
              </div>
              <div className="f">
                <label>Apellidos</label>
                <input defaultValue={paciente.apellidos} onBlur={(e) => guardarCampo('apellidos', e.target.value)} />
              </div>
              <div className="f">
                <label>DNI / NIE</label>
                <input defaultValue={paciente.dni || ''} onBlur={(e) => guardarCampo('dni', e.target.value)} />
              </div>
              <div className="f">
                <label>Nacimiento</label>
                <input type="date" defaultValue={paciente.nacimiento ? paciente.nacimiento.slice(0, 10) : ''} onBlur={(e) => guardarCampo('nacimiento', e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null)} />
              </div>
              <div className="f">
                <label>Teléfono</label>
                <input defaultValue={paciente.telefono || ''} onBlur={(e) => guardarCampo('telefono', e.target.value)} />
              </div>
              <div className="f">
                <label>Email</label>
                <input defaultValue={paciente.email || ''} onBlur={(e) => guardarCampo('email', e.target.value)} />
              </div>
            </div>
            <div className="f">
              <label>Dirección</label>
              <input defaultValue={paciente.direccion || ''} onBlur={(e) => guardarCampo('direccion', e.target.value)} />
            </div>
            <div className="f">
              <label>Doctor asignado</label>
              <select
                defaultValue={paciente.doctorId || ''}
                onChange={(e) => {
                  guardarCampo('doctorId', e.target.value || null);
                }}
              >
                <option value="">— sin asignar —</option>
                {dentistas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="f">
              <label>Cómo nos conoció</label>
              <input defaultValue={paciente.origen || ''} placeholder="Recomendación, Google, seguro…" onBlur={(e) => guardarCampo('origen', e.target.value)} />
            </div>
            <hr />
            <div className="f">
              <label>Alergias</label>
              <input
                className={paciente.alergias ? '' : 'falta'}
                defaultValue={paciente.alergias || ''}
                placeholder='Penicilina, látex, anestésicos… escribe "ninguna" si no tiene'
                onBlur={(e) => guardarCampo('alergias', e.target.value)}
              />
            </div>
            <div className="f">
              <label>Medicación actual</label>
              <input defaultValue={paciente.medicacion || ''} onBlur={(e) => guardarCampo('medicacion', e.target.value)} />
            </div>
            <div className="f">
              <label>Antecedentes médicos</label>
              <textarea
                defaultValue={paciente.antecedentes || ''}
                placeholder="Cardiopatía, diabetes, anticoagulantes, embarazo, bifosfonatos…"
                onBlur={(e) => guardarCampo('antecedentes', e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <h3>Consentimiento y protección de datos</h3>
            <p className="mini">Leer con el paciente, marcar casillas y recoger firma antes de la primera cita.</p>
            {clinica && <div className="legal">{textoLegal(clinica)}</div>}
            <div style={{ marginTop: 12 }}>
              {(
                [
                  ['consentDatosAceptado', 'Consiento el tratamiento de mis datos personales y de salud para la asistencia sanitaria y su historia clínica (obligatorio).'],
                  ['consentTratamientoAceptado', 'He sido informado/a del tratamiento propuesto, alternativas, riesgos y presupuesto, y lo consiento (obligatorio).'],
                  ['consentImagenesAceptado', 'Autorizo radiografías, fotografías y escáneres intraorales con fines clínicos.'],
                  ['consentComercialAceptado', 'Autorizo recordatorios de cita y comunicaciones de la clínica por SMS, email o WhatsApp.'],
                ] as const
              ).map(([campo, texto]) => (
                <label
                  key={campo}
                  style={{ display: 'flex', gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--grafito)', fontWeight: 400, marginBottom: 9, alignItems: 'flex-start' }}
                >
                  <input type="checkbox" style={{ width: 16, flex: '0 0 16px', marginTop: 2 }} checked={paciente[campo]} onChange={(e) => guardarConsent(campo, e.target.checked)} />
                  <span>{texto}</span>
                </label>
              ))}
            </div>
            <label style={{ marginTop: 6, display: 'block' }}>Firma del paciente (o tutor legal)</label>
            {paciente.consentFirmaArchivoId && !reFirmando ? (
              <>
                {firmaUrl && <img src={firmaUrl} style={{ border: '1px solid var(--linea)', borderRadius: 8, background: '#fff', maxWidth: '100%', height: 130, objectFit: 'contain' }} />}
                <div className="fila" style={{ marginTop: 8 }}>
                  {paciente.consentFecha && <span className="tag ok">Firmada el {fechaCorta(paciente.consentFecha)}</span>}
                  <button className="btn gh sm" onClick={() => setReFirmando(true)}>
                    Volver a firmar
                  </button>
                </div>
              </>
            ) : (
              <FirmaCanvas onGuardar={guardarFirma} guardando={guardandoFirma} />
            )}
          </div>
        </div>
      )}

      {tab === 'historia' && (
        <div>
          <div className="card">
            <h3>Registrar sesión</h3>
            <p className="mini">Graba lo que se hizo mientras trabajas: el audio queda en la carpeta del paciente junto a la nota escrita.</p>
            <div className={`rec ${grabando ? 'on' : ''}`}>
              <div className="dot" />
              <div className="t">
                {String(Math.floor(segundosGrabados / 60)).padStart(2, '0')}:{String(segundosGrabados % 60).padStart(2, '0')}
              </div>
              <button type="button" className="btn pri sm" onClick={alternarGrabacion}>
                {grabando ? 'Detener' : 'Grabar'}
              </button>
              <span className="mini" style={{ color: '#8FA6A4' }}>
                {mensajeGrabacion}
              </span>
            </div>
            <form onSubmit={anadirNota} style={{ marginTop: 14 }}>
              <div className="grid g3">
                <div className="f">
                  <label>Acto</label>
                  <input type="text" name="acto" placeholder="Obturación 26 oclusal" required />
                </div>
                <div className="f">
                  <label>Piezas</label>
                  <input type="text" name="piezas" placeholder="26, 27" />
                </div>
              </div>
              <div className="f">
                <label>Nota clínica</label>
                <textarea name="nota" placeholder="Anestesia, técnica, materiales, incidencias, indicaciones al paciente…" required />
              </div>
              <div className="f">
                <label>Material consumido (descuenta stock)</label>
                <div className="fila">
                  <select name="materialId" style={{ flex: 1 }}>
                    <option value="">— ninguno —</option>
                    {materiales.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} ({m.cantidad} {m.unidad})
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn gh sm" onClick={anadirMaterial}>
                    + Nuevo material
                  </button>
                </div>
              </div>
              <div className="grid g3">
                <div className="f">
                  <label>Cantidad usada</label>
                  <input type="number" name="cantidadMaterial" defaultValue={0} min={0} step="1" />
                </div>
              </div>
              <button className="btn pri" type="submit">
                Guardar en la historia
              </button>
            </form>
          </div>

          <div className="card">
            <h3>Historia clínica</h3>
            <hr />
            {paciente.historiaClinica.length === 0 ? (
              <p className="vacio">Sin entradas todavía.</p>
            ) : (
              <div className="linea">
                {paciente.historiaClinica.map((h) => (
                  <div className="ev trat" key={h.id}>
                    <div className="evf">
                      {new Date(h.fecha).toLocaleDateString('es-ES')}
                      <small>{new Date(h.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                    <div className="evc">
                      <b>{h.acto}</b>
                      {h.piezas && (
                        <span className="tag info" style={{ marginLeft: 6 }}>
                          pieza {h.piezas}
                        </span>
                      )}
                      <p className="mini" style={{ marginTop: 4 }}>
                        {h.nota}
                      </p>
                      {h.audioArchivoId && <AudioSesion archivoId={h.audioArchivoId} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'odontograma' && (
        <div className="card">
          <h3>Odontograma</h3>
          <p className="mini">Toca cada pieza para cambiar el estado. Se guarda solo.</p>
          <div style={{ maxWidth: 460, margin: '0 auto' }}>
            <p className="mini" style={{ textAlign: 'center', fontWeight: 600 }}>
              Maxilar
            </p>
            <div style={{ position: 'relative', height: alturaArco(190) + 34 }}>
              {SUP_DIENTES.map((n, i) => {
                const pos = posicionArco(i, SUP_DIENTES.length, 190, true);
                return (
                  <div
                    key={n}
                    className={`diente ${paciente.odontograma[n] || ''}`}
                    style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translateX(-50%)' }}
                    onClick={() => ciclarDiente(n)}
                  >
                    <small>{n}</small>
                    <i />
                  </div>
                );
              })}
            </div>
            <hr style={{ margin: '8px 0' }} />
            <div style={{ position: 'relative', height: alturaArco(190) + 34 }}>
              {INF_DIENTES.map((n, i) => {
                const pos = posicionArco(i, INF_DIENTES.length, 190, false);
                return (
                  <div
                    key={n}
                    className={`diente ${paciente.odontograma[n] || ''}`}
                    style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translateX(-50%)' }}
                    onClick={() => ciclarDiente(n)}
                  >
                    <small>{n}</small>
                    <i />
                  </div>
                );
              })}
            </div>
            <p className="mini" style={{ textAlign: 'center', fontWeight: 600 }}>
              Mandíbula
            </p>
          </div>
          <div className="leyenda">
            <span>
              <em style={{ background: '#EDEFF5' }} />
              Sano
            </span>
            <span>
              <em style={{ background: 'var(--rojo)' }} />
              Caries
            </span>
            <span>
              <em style={{ background: '#3B4076' }} />
              Obturado
            </span>
            <span>
              <em style={{ background: '#EC6F2B' }} />
              Endodoncia
            </span>
            <span>
              <em style={{ background: 'var(--ambar)' }} />
              Corona
            </span>
            <span>
              <em style={{ background: '#8B5CF6' }} />
              Implante
            </span>
            <span>
              <em style={{ background: 'var(--grafito)' }} />
              Ausente
            </span>
          </div>
          <hr />
          <div className="f">
            <label>Observaciones de la revisión inicial</label>
            <textarea
              defaultValue={paciente.notasOdontograma || ''}
              placeholder="Exploración, oclusión, periodonto, ATM, plan propuesto…"
              onBlur={(e) => guardarCampo('notasOdontograma', e.target.value)}
            />
          </div>
        </div>
      )}

      {tab === 'presupuestos' && (
        <div className="card">
          <div className="entre">
            <h3>Presupuestos</h3>
            <Link className="btn pri sm" style={{ textDecoration: 'none' }} to={`/presupuestos?paciente=${paciente.id}`}>
              Nuevo presupuesto
            </Link>
          </div>
          <hr />
          {presupuestos.length === 0 ? (
            <div className="vacio">Sin presupuestos. Crea el primero tras la revisión inicial.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tratamientos</th>
                  <th>Estado</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {presupuestos.map((p) => (
                  <tr key={p.id}>
                    <td>{fechaCorta(p.fecha)}</td>
                    <td>{p.lineas.map((l) => l.nombre).join(', ').slice(0, 60) || '—'}</td>
                    <td>
                      <span className={TAG_ESTADO_PRESU[p.estado] || 'tag'}>{p.estado}</span>
                    </td>
                    <td className="num">{eur(totalPresupuesto(mapLineas(p.lineas), p.descuentoPct))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'cobros' && (
        <div className="card">
          <div className="entre">
            <h3>Cobros</h3>
            <button className="btn pri sm" onClick={() => setModalCobro(true)}>
              Registrar cobro
            </button>
          </div>
          <hr />
          {cobros.length === 0 ? (
            <div className="vacio">Sin cobros registrados.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Forma</th>
                  <th className="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((c) => (
                  <tr key={c.id}>
                    <td>{fechaCorta(c.fecha)}</td>
                    <td>{c.concepto || ''}</td>
                    <td>
                      <span className="tag">{FORMAS[c.forma] || c.forma}</span>
                    </td>
                    <td className="num">{eur(c.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'laboratorio' && (
        <div className="card">
          <div className="entre">
            <h3>Trabajos de laboratorio</h3>
            <button className="btn pri sm" onClick={() => setModalLab(true)}>
              Nuevo trabajo
            </button>
          </div>
          <hr />
          {laboratorios.length === 0 ? (
            <div className="vacio">Sin trabajos enviados.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Envío</th>
                  <th>Tipo</th>
                  <th>Laboratorio</th>
                  <th>Estado</th>
                  <th className="num">Coste</th>
                </tr>
              </thead>
              <tbody>
                {laboratorios.map((t) => (
                  <tr key={t.id}>
                    <td>{fechaCorta(t.fechaEnvio)}</td>
                    <td>
                      {t.tipo}
                      {t.trabajo && <div className="mini">{t.trabajo}</div>}
                    </td>
                    <td className="mini">{t.nombreLab || '—'}</td>
                    <td>
                      <span className={TAG_ESTADO_LAB[t.estado] || 'tag'}>{t.estado}</span>
                    </td>
                    <td className="num">{eur(t.coste)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'material' && (
        <div className="card">
          <h3>Material consumido por este paciente</h3>
          <p className="mini">
            Se registra al guardar cada sesión. Coste acumulado: <b>{eur(consumosMaterial.reduce((a, c) => a + c.coste, 0))}</b>
          </p>
          <hr />
          {consumosMaterial.length === 0 ? (
            <div className="vacio">Aún no se ha imputado material.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Referencia</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Coste</th>
                </tr>
              </thead>
              <tbody>
                {consumosMaterial.map((c) => (
                  <tr key={c.id}>
                    <td>{fechaCorta(c.fecha)}</td>
                    <td>{c.material.nombre}</td>
                    <td className="num">
                      {c.cantidad} {c.material.unidad}
                    </td>
                    <td className="num">{eur(c.coste)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'archivos' && (
        <div className="card">
          <h3>Archivos</h3>
          <p className="mini">Radiografías, fotos, informes, consentimientos escaneados. Se guardan en la carpeta del paciente.</p>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            disabled={subiendo}
            onChange={(e) => e.target.files && subirArchivos(e.target.files)}
            style={{ margin: '10px 0' }}
          />
          {subiendo && <p className="mini">Subiendo…</p>}
          <hr />
          {paciente.archivos.length === 0 ? (
            <div className="vacio">Carpeta vacía.</div>
          ) : (
            <div className="grid g3">
              {paciente.archivos.map((a) => (
                <div key={a.id} style={{ border: '1px solid var(--linea)', borderRadius: 8, padding: 8 }}>
                  <div style={{ height: 120, display: 'grid', placeItems: 'center', background: '#F4F7F6', borderRadius: 6 }}>{a.mime.startsWith('image') ? '🖼️' : 'PDF'}</div>
                  <div className="mini" style={{ marginTop: 6 }}>
                    {a.nombre}
                    <br />
                    {fechaCorta(a.createdAt)}
                  </div>
                  <div className="fila" style={{ marginTop: 6 }}>
                    <button className="btn gh sm" onClick={() => descargarArchivo(a)}>
                      Descargar
                    </button>
                    <button className="btn gh sm" onClick={() => borrarArchivo(a)}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalCobro && (
        <Modal onClose={() => setModalCobro(false)}>
          <h2>Registrar cobro</h2>
          <form onSubmit={registrarCobro}>
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div className="f">
                <label>Fecha</label>
                <input type="date" name="fecha" defaultValue={hoy} />
              </div>
              <div className="f">
                <label>Importe</label>
                <input type="number" name="importe" step="0.01" defaultValue={pendiente > 0 ? pendiente.toFixed(2) : ''} required />
              </div>
              <div className="f">
                <label>Tipo</label>
                <select name="tipo" defaultValue="pago">
                  <option value="pago">Pago de tratamiento</option>
                  <option value="anticipo">Entrega a cuenta</option>
                </select>
              </div>
              <div className="f">
                <label>Forma de pago</label>
                <select name="forma" defaultValue="tarjeta">
                  {Object.entries(FORMAS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="f">
              <label>Concepto</label>
              <input name="concepto" placeholder="A cuenta tratamiento, corona 26…" />
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="btn gh" type="button" onClick={() => setModalCobro(false)}>
                Cancelar
              </button>
              <button className="btn pri" type="submit">
                Guardar cobro
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modalLab && (
        <Modal onClose={() => setModalLab(false)} ancho={640}>
          <h2>Nuevo trabajo de laboratorio</h2>
          <form onSubmit={crearLab}>
            <div className="grid g2" style={{ marginTop: 12 }}>
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
                <input type="date" name="fechaEnvio" defaultValue={hoy} />
              </div>
              <div className="f">
                <label>Días de entrega</label>
                <input type="number" name="diasEntrega" defaultValue={7} />
              </div>
              <div className="f">
                <label>Coste laboratorio (€)</label>
                <input type="number" name="coste" step="0.01" defaultValue={0} />
              </div>
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="btn gh" type="button" onClick={() => setModalLab(false)}>
                Cancelar
              </button>
              <button className="btn pri" type="submit">
                Guardar trabajo
              </button>
            </div>
          </form>
        </Modal>
      )}

      {enlaceAcceso && (
        <Modal onClose={() => setEnlaceAcceso(null)}>
          <h2>
            Acceso de {paciente.nombre} {paciente.apellidos}
          </h2>
          <p className="mini" style={{ marginTop: 8 }}>
            Válido durante 15 minutos y de un solo uso. Cópialo o envíalo por WhatsApp.
          </p>
          <div className="f" style={{ marginTop: 10 }}>
            <input readOnly value={enlaceAcceso} onFocus={(e) => e.target.select()} />
          </div>
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn gh" onClick={() => navigator.clipboard.writeText(enlaceAcceso).catch(() => {})}>
              Copiar enlace
            </button>
            <button className="btn gh" onClick={() => setEnlaceAcceso(null)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
