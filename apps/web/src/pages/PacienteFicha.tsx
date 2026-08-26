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

  if (!paciente) return <p className="vacio">Cargando…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>
            {paciente.nombre} {paciente.apellidos}
          </h1>
          <p>{paciente.dni || paciente.telefono || 'Sin datos de contacto'}</p>
        </div>
      </div>

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
        <div className="card grid g2">
          <div>
            <label>Teléfono</label>
            <p>{paciente.telefono || '—'}</p>
          </div>
          <div>
            <label>Email</label>
            <p>{paciente.email || '—'}</p>
          </div>
          <div>
            <label>DNI</label>
            <p>{paciente.dni || '—'}</p>
          </div>
          <div>
            <label>Alergias</label>
            <p>{paciente.alergias || '—'}</p>
          </div>
          <div>
            <label>Medicación</label>
            <p>{paciente.medicacion || '—'}</p>
          </div>
          <div>
            <label>Antecedentes</label>
            <p>{paciente.antecedentes || '—'}</p>
          </div>
        </div>
      )}

      {tab === 'historia' && (
        <div>
          <div className="card">
            <form onSubmit={anadirNota}>
              <div className="grid g3">
                <div className="f">
                  <label>Acto</label>
                  <input type="text" name="acto" required />
                </div>
                <div className="f">
                  <label>Piezas</label>
                  <input type="text" name="piezas" />
                </div>
              </div>
              <div className="f">
                <label>Nota</label>
                <textarea name="nota" required />
              </div>
              <button className="btn pri" type="submit">
                Añadir a la historia
              </button>
            </form>
          </div>

          <div className="card">
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
                      {h.piezas && <span className="tag info" style={{ marginLeft: 6 }}>pieza {h.piezas}</span>}
                      <p className="mini" style={{ marginTop: 4 }}>
                        {h.nota}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'archivos' && (
        <div className="card">
          {paciente.archivos.length === 0 ? (
            <p className="vacio">Sin archivos todavía.</p>
          ) : (
            <table>
              <tbody>
                {paciente.archivos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nombre}</td>
                    <td className="mini">{a.mime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
