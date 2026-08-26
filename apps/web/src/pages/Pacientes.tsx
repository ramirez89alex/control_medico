import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  dni: string | null;
}

export function Pacientes() {
  const [q, setQ] = useState('');
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);

  async function buscar() {
    setPacientes(await api.get<Paciente[]>(`/pacientes?q=${encodeURIComponent(q)}`));
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function crearPaciente(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api.post('/pacientes', {
      nombre: form.get('nombre'),
      apellidos: form.get('apellidos'),
      telefono: form.get('telefono') || undefined,
      dni: form.get('dni') || undefined,
      email: form.get('email') || undefined,
    });
    setMostrarForm(false);
    buscar();
  }

  return (
    <div>
      <div className="entre">
        <h2>Pacientes</h2>
        <input placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn pri" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : 'Nuevo paciente'}
        </button>
      </div>

      {mostrarForm && (
        <form className="card" onSubmit={crearPaciente}>
          <label>
            Nombre
            <input type="text" name="nombre" required />
          </label>
          <label>
            Apellidos
            <input type="text" name="apellidos" required />
          </label>
          <label>
            Teléfono
            <input type="text" name="telefono" />
          </label>
          <label>
            DNI
            <input type="text" name="dni" />
          </label>
          <label>
            Email
            <input type="email" name="email" />
          </label>
          <button className="btn pri" type="submit">
            Guardar
          </button>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>DNI</th>
            <th>Teléfono</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/pacientes/${p.id}`}>
                  {p.nombre} {p.apellidos}
                </Link>
              </td>
              <td>{p.dni}</td>
              <td>{p.telefono}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
