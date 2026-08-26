import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
}

interface Dentista {
  id: string;
  nombre: string;
  color: string;
}

interface Gabinete {
  id: string;
  nombre: string;
}

interface Cita {
  id: string;
  fecha: string;
  hora: string;
  duracionMin: number;
  motivo: string | null;
  estado: string;
  paciente: Paciente | null;
  nombreLibre: string | null;
  dentista: Dentista | null;
  gabinete: Gabinete | null;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
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

  return (
    <div>
      <div className="entre">
        <h2>Agenda</h2>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <button className="btn pri" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : 'Nueva cita'}
        </button>
      </div>

      {mostrarForm && (
        <form className="card" onSubmit={crearCita}>
          <label>
            Paciente
            <select name="pacienteId">
              <option value="">— sin ficha —</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hora
            <select name="hora" required>
              {huecos.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duración (min)
            <input type="number" name="duracionMin" defaultValue={30} step={15} min={15} />
          </label>
          <label>
            Dentista
            <select name="dentistaId">
              <option value="">—</option>
              {dentistas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Gabinete
            <select name="gabineteId">
              <option value="">—</option>
              {gabinetes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo
            <input type="text" name="motivo" />
          </label>
          <button className="btn pri" type="submit">
            Guardar
          </button>
        </form>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : citas.length === 0 ? (
        <p>Sin citas para este día.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Paciente</th>
              <th>Dentista</th>
              <th>Gabinete</th>
              <th>Motivo</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {citas.map((c) => (
              <tr key={c.id}>
                <td>{c.hora}</td>
                <td>{c.paciente ? `${c.paciente.nombre} ${c.paciente.apellidos}` : c.nombreLibre || '—'}</td>
                <td>{c.dentista?.nombre || '—'}</td>
                <td>{c.gabinete?.nombre || '—'}</td>
                <td>{c.motivo}</td>
                <td>{c.estado}</td>
                <td>
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
  );
}
