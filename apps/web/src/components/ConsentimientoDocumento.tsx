import { ClinicaLegal, CONSENTIMIENTOS, textoLegal } from '../lib/legal';

interface PacienteDoc {
  nombre: string;
  apellidos: string;
  dni: string | null;
  nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  alergias: string | null;
  medicacion: string | null;
  antecedentes: string | null;
}

interface ConsentimientoDoc {
  datos: boolean;
  tratamiento: boolean;
  imagenes: boolean;
  comercial: boolean;
  fecha: string | null;
  firmaUrl: string | null;
}

interface Props {
  clinica: ClinicaLegal;
  paciente: PacienteDoc;
  consentimiento: ConsentimientoDoc;
}

function hoyLargo() {
  return new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ConsentimientoDocumento({ clinica, paciente, consentimiento }: Props) {
  const nacimiento = paciente.nacimiento ? new Date(paciente.nacimiento).toLocaleDateString('es-ES') : '—';
  const contacto = [paciente.telefono, paciente.email].filter(Boolean).join(' · ') || '—';

  return (
    <div className="doc">
      <div className="cab">
        <div>
          <h2>{clinica.nombre}</h2>
          <div className="mini">
            {clinica.direccion ? `${clinica.direccion}, ${clinica.cp || ''} ${clinica.ciudad || ''}` : ''}
            {clinica.nif ? ` · NIF ${clinica.nif}` : ''}
          </div>
          <div className="mini">{clinica.email || ''}</div>
        </div>
        <div className="mini">{hoyLargo()}</div>
      </div>

      <h2>Consentimiento informado</h2>

      <table>
        <tbody>
          <tr>
            <td style={{ width: 140 }}>
              <b>Nombre</b>
            </td>
            <td>
              {paciente.nombre} {paciente.apellidos}
            </td>
          </tr>
          <tr>
            <td>
              <b>DNI / NIE</b>
            </td>
            <td>{paciente.dni || '—'}</td>
          </tr>
          <tr>
            <td>
              <b>Nacimiento</b>
            </td>
            <td>{nacimiento}</td>
          </tr>
          <tr>
            <td>
              <b>Teléfono / email</b>
            </td>
            <td>{contacto}</td>
          </tr>
          <tr>
            <td>
              <b>Dirección</b>
            </td>
            <td>{paciente.direccion || '—'}</td>
          </tr>
          <tr>
            <td>
              <b>Alergias</b>
            </td>
            <td>{paciente.alergias || '—'}</td>
          </tr>
          <tr>
            <td>
              <b>Medicación</b>
            </td>
            <td>{paciente.medicacion || '—'}</td>
          </tr>
          <tr>
            <td>
              <b>Antecedentes</b>
            </td>
            <td>{paciente.antecedentes || '—'}</td>
          </tr>
        </tbody>
      </table>

      <div className="legal" style={{ marginTop: 14 }}>
        {textoLegal(clinica)}
      </div>

      <h4>Consentimientos otorgados</h4>
      <p>
        {CONSENTIMIENTOS.map(([campo, texto]) => (
          <span key={campo} style={{ display: 'block', marginBottom: 4 }}>
            {consentimiento[campo as keyof ConsentimientoDoc] ? '☑' : '☐'} {texto}
          </span>
        ))}
      </p>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 24 }}>
        <div>
          {consentimiento.firmaUrl ? (
            <img src={consentimiento.firmaUrl} alt="Firma del paciente" style={{ height: 90, display: 'block' }} />
          ) : (
            <div style={{ height: 90 }} />
          )}
          <div className="mini">Firma del paciente o tutor legal</div>
          {consentimiento.fecha && <div className="mini">Firmado el {new Date(consentimiento.fecha).toLocaleDateString('es-ES')}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ height: 90 }} />
          <div className="mini">Por la clínica</div>
        </div>
      </div>

      <div className="pie">{clinica.nombre} · Conservar en la historia clínica del paciente</div>
    </div>
  );
}
