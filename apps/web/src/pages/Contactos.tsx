import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';

interface Contacto {
  id: string;
  nombre: string;
  tipo: 'equipo' | 'proveedor' | 'laboratorio' | 'interno' | 'otro';
  referencia: string | null;
  telefono: string | null;
  email: string | null;
  editable: boolean;
}

interface Paciente {
  id: string;
  nombre: string;
  apellidos: string;
  telefono: string | null;
}

const GRUPOS: Array<{ tipo: Contacto['tipo']; titulo: string }> = [
  { tipo: 'equipo', titulo: 'Equipo' },
  { tipo: 'proveedor', titulo: 'Proveedor' },
  { tipo: 'laboratorio', titulo: 'Laboratorio' },
  { tipo: 'interno', titulo: 'Interno' },
  { tipo: 'otro', titulo: 'Otro' },
];

function telWA(tel: string) {
  const limpio = tel.replace(/[^\d]/g, '');
  return limpio.length === 9 ? `34${limpio}` : limpio;
}

export function Contactos() {
  const [q, setQ] = useState('');
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<Contacto | null>(null);

  async function cargar() {
    setContactos(await api.get<Contacto[]>('/contactos'));
    setPacientes(await api.get<Paciente[]>('/pacientes'));
  }

  useEffect(() => {
    cargar();
  }, []);

  const ql = q.toLowerCase();
  const filtro = (c: { nombre: string; referencia?: string | null; telefono?: string | null }) =>
    !ql || `${c.nombre} ${c.referencia || ''} ${c.telefono || ''}`.toLowerCase().includes(ql);

  const listaFiltrada = contactos.filter(filtro);
  const pacientesConTel = pacientes.filter((p) => p.telefono && filtro({ nombre: `${p.nombre} ${p.apellidos}`, telefono: p.telefono }));

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      nombre: form.get('nombre'),
      tipo: form.get('tipo'),
      referencia: form.get('referencia') || undefined,
      telefono: form.get('telefono') || undefined,
      email: form.get('email') || undefined,
    };
    if (editando) await api.put(`/contactos/${editando.id}`, payload);
    else await api.post('/contactos', payload);
    setMostrarForm(false);
    setEditando(null);
    cargar();
  }

  async function borrar(id: string) {
    await api.del(`/contactos/${id}`);
    cargar();
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Contactos</h1>
          <p>Todo lo que hemos ido generando: equipo, laboratorios y pacientes</p>
        </div>
        <div className="acciones">
          <button
            className="btn pri"
            onClick={() => {
              setEditando(null);
              setMostrarForm(true);
            }}
          >
            Nuevo contacto
          </button>
        </div>
      </div>

      <div className="card">
        <input placeholder="Buscar contacto…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {GRUPOS.map(({ tipo, titulo }) => {
        const grupo = listaFiltrada.filter((c) => c.tipo === tipo);
        if (grupo.length === 0) return null;
        return (
          <div className="card" key={tipo}>
            <h3>{titulo}</h3>
            <hr />
            <table>
              <tbody>
                {grupo.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.nombre}</b>
                      <div className="mini">{c.referencia || ''}</div>
                    </td>
                    <td className="mini">
                      {c.telefono || '—'}
                      {c.email && (
                        <>
                          <br />
                          {c.email}
                        </>
                      )}
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {c.telefono && (
                        <>
                          <a className="btn gh sm" style={{ textDecoration: 'none' }} href={`tel:${c.telefono}`}>
                            Llamar
                          </a>{' '}
                          <a
                            className="btn pri sm"
                            style={{ textDecoration: 'none' }}
                            target="_blank"
                            rel="noreferrer"
                            href={`https://wa.me/${telWA(c.telefono)}`}
                          >
                            WhatsApp
                          </a>{' '}
                        </>
                      )}
                      {c.editable && (
                        <>
                          <button
                            className="btn gh sm"
                            onClick={() => {
                              setEditando(c);
                              setMostrarForm(true);
                            }}
                          >
                            Editar
                          </button>{' '}
                          <button className="btn gh sm" onClick={() => borrar(c.id)}>
                            ×
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="card">
        <div className="entre">
          <h3>Pacientes con teléfono</h3>
          <span className="mini">{pacientesConTel.length}</span>
        </div>
        <hr />
        {pacientesConTel.length ? (
          <table>
            <tbody>
              {pacientesConTel.slice(0, 40).map((p) => (
                <tr className="click" key={p.id}>
                  <td>
                    <Link to={`/pacientes/${p.id}`} style={{ color: 'var(--grafito)', textDecoration: 'none', fontWeight: 600 }}>
                      {p.nombre} {p.apellidos}
                    </Link>
                  </td>
                  <td className="mini">{p.telefono}</td>
                  <td className="num">
                    <a className="btn pri sm" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer" href={`https://wa.me/${telWA(p.telefono!)}`}>
                      WhatsApp
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="vacio">Ningún paciente con teléfono guardado.</div>
        )}
      </div>

      {mostrarForm && (
        <Modal
          onClose={() => {
            setMostrarForm(false);
            setEditando(null);
          }}
        >
          <h2>{editando ? 'Editar contacto' : 'Nuevo contacto'}</h2>
          <form onSubmit={guardar}>
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div className="f">
                <label>Nombre</label>
                <input name="nombre" defaultValue={editando?.nombre} required />
              </div>
              <div className="f">
                <label>Tipo</label>
                <select name="tipo" defaultValue={editando?.tipo === 'equipo' ? 'otro' : editando?.tipo || 'otro'}>
                  <option value="proveedor">Proveedor</option>
                  <option value="laboratorio">Laboratorio</option>
                  <option value="interno">Interno</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="f">
                <label>Teléfono</label>
                <input name="telefono" defaultValue={editando?.telefono || ''} />
              </div>
              <div className="f">
                <label>Email</label>
                <input name="email" type="email" defaultValue={editando?.email || ''} />
              </div>
            </div>
            <div className="f">
              <label>Referencia</label>
              <input name="referencia" defaultValue={editando?.referencia || ''} placeholder="Comercial, urgencias, técnico del sillón…" />
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button
                className="btn gh"
                type="button"
                onClick={() => {
                  setMostrarForm(false);
                  setEditando(null);
                }}
              >
                Cancelar
              </button>
              <button className="btn pri" type="submit">
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
