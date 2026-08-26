import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Archivo {
  id: string;
  nombre: string;
  mime: string;
}

interface HistoriaEntrada {
  id: string;
  fecha: string;
  acto: string;
  piezas: string | null;
  nota: string;
}

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  dni: string | null;
  alergias: string | null;
  medicacion: string | null;
  antecedentes: string | null;
  archivos: Archivo[];
  historiaClinica: HistoriaEntrada[];
}

type Tab = 'datos' | 'historia' | 'archivos';

export function PacienteFicha() {
  const { id } = useParams<{ id: string }>();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [tab, setTab] = useState<Tab>('datos');

  async function cargar() {
    if (!id) return;
    setPaciente(await api.get<Paciente>(`/pacientes/${id}`));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function anadirNota(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post(`/pacientes/${id}/historia`, {
      acto: form.get('acto'),
      piezas: form.get('piezas') || undefined,
      nota: form.get('nota'),
    });
    (e.target as HTMLFormElement).reset();
    cargar();
  }

  if (!paciente) return <p>Cargando…</p>;

  return (
    <div>
      <h2>
        {paciente.nombre} {paciente.apellidos}
      </h2>
      <div className="tabs">
        <button className={tab === 'datos' ? 'on' : ''} onClick={() => setTab('datos')}>
          Datos
        </button>
        <button className={tab === 'historia' ? 'on' : ''} onClick={() => setTab('historia')}>
          Historia clínica
        </button>
        <button className={tab === 'archivos' ? 'on' : ''} onClick={() => setTab('archivos')}>
          Archivos
        </button>
      </div>

      {tab === 'datos' && (
        <div className="card">
          <p>
            <b>Teléfono:</b> {paciente.telefono || '—'}
          </p>
          <p>
            <b>Email:</b> {paciente.email || '—'}
          </p>
          <p>
            <b>DNI:</b> {paciente.dni || '—'}
          </p>
          <p>
            <b>Alergias:</b> {paciente.alergias || '—'}
          </p>
          <p>
            <b>Medicación:</b> {paciente.medicacion || '—'}
          </p>
          <p>
            <b>Antecedentes:</b> {paciente.antecedentes || '—'}
          </p>
        </div>
      )}

      {tab === 'historia' && (
        <div>
          <form className="card" onSubmit={anadirNota}>
            <label>
              Acto
              <input type="text" name="acto" required />
            </label>
            <label>
              Piezas
              <input type="text" name="piezas" />
            </label>
            <label>
              Nota
              <textarea name="nota" required />
            </label>
            <button className="btn pri" type="submit">
              Añadir a la historia
            </button>
          </form>
          <ul className="historia-lista">
            {paciente.historiaClinica.map((h) => (
              <li key={h.id}>
                <div className="mini">
                  {new Date(h.fecha).toLocaleString('es-ES')} {h.piezas ? `· pieza ${h.piezas}` : ''}
                </div>
                <b>{h.acto}</b>
                <p>{h.nota}</p>
              </li>
            ))}
            {paciente.historiaClinica.length === 0 && <p>Sin entradas todavía.</p>}
          </ul>
        </div>
      )}

      {tab === 'archivos' && (
        <ul>
          {paciente.archivos.map((a) => (
            <li key={a.id}>
              {a.nombre} ({a.mime})
            </li>
          ))}
          {paciente.archivos.length === 0 && <p>Sin archivos todavía.</p>}
        </ul>
      )}
    </div>
  );
}
