import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  dni: string | null;
  consentFirmaArchivoId: string | null;
}

interface Saldo {
  paciente: { id: string };
  pendiente: number;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function Pacientes() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(true);

  async function buscar() {
    setCargando(true);
    setPacientes(await api.get<Paciente[]>(`/pacientes?q=${encodeURIComponent(q)}`));
    setCargando(false);
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    api.get<Saldo[]>('/cobros/saldos').then((lista) => {
      const mapa: Record<string, number> = {};
      lista.forEach((s) => (mapa[s.paciente.id] = s.pendiente));
      setSaldos(mapa);
    });
  }, []);

  async function crearPaciente(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const paciente = await api.post<Paciente>('/pacientes', {
      nombre: form.get('nombre'),
      apellidos: form.get('apellidos'),
      telefono: form.get('telefono') || undefined,
      dni: form.get('dni') || undefined,
      email: form.get('email') || undefined,
    });
    navigate(`/pacientes/${paciente.id}`);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Pacientes</h1>
          <p>{pacientes.length} fichas · carpeta única por paciente</p>
        </div>
        <div className="acciones">
          <input placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn pri" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : 'Nuevo paciente'}
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
        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : pacientes.length === 0 ? (
          <div className="vacio">Sin resultados.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Contacto</th>
                <th>RGPD</th>
                <th className="num">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => {
                const pendiente = saldos[p.id] || 0;
                return (
                  <tr key={p.id} className="click">
                    <td>
                      <Link to={`/pacientes/${p.id}`} style={{ color: 'var(--grafito)', fontWeight: 600, textDecoration: 'none' }}>
                        {p.nombre} {p.apellidos}
                      </Link>
                      <div className="mini">{p.dni || ''}</div>
                    </td>
                    <td className="mini">
                      {p.telefono || '—'}
                      <br />
                      {p.email || ''}
                    </td>
                    <td>{p.consentFirmaArchivoId ? <span className="tag ok">Firmada</span> : <span className="tag bad">Pendiente</span>}</td>
                    <td className="num" style={{ color: pendiente > 0.5 ? 'var(--rojo)' : 'inherit' }}>
                      {eur(pendiente)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
