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
      <div className="topbar">
        <div>
          <h1>Pacientes</h1>
          <p>{pacientes.length} en la ficha de la clínica</p>
        </div>
        <div className="acciones">
          <input placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn pri" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo paciente'}
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div className="card">
          <form onSubmit={crearPaciente}>
            <div className="grid g3">
              <div className="f">
                <label>Nombre</label>
                <input type="text" name="nombre" required />
              </div>
              <div className="f">
                <label>Apellidos</label>
                <input type="text" name="apellidos" required />
              </div>
              <div className="f">
                <label>Teléfono</label>
                <input type="text" name="telefono" />
              </div>
              <div className="f">
                <label>DNI</label>
                <input type="text" name="dni" />
              </div>
              <div className="f">
                <label>Email</label>
                <input type="email" name="email" />
              </div>
            </div>
            <button className="btn pri" type="submit">
              Guardar paciente
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {pacientes.length === 0 ? (
          <p className="vacio">Sin pacientes todavía.</p>
        ) : (
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
                <tr key={p.id} className="click">
                  <td>
                    <Link to={`/pacientes/${p.id}`} style={{ color: 'var(--grafito)', fontWeight: 600, textDecoration: 'none' }}>
                      {p.nombre} {p.apellidos}
                    </Link>
                  </td>
                  <td>{p.dni || '—'}</td>
                  <td>{p.telefono || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
