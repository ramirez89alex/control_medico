import type { ClinicaLegal } from '../lib/legal';

function hoyLargo() {
  return new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function DocCabecera({ clinica }: { clinica: ClinicaLegal }) {
  return (
    <div className="cab">
      <div>
        {clinica.logoUrl && <img src={clinica.logoUrl} alt={clinica.nombre} style={{ height: 38, marginBottom: 6, display: 'block' }} />}
        <h2>{clinica.nombre}</h2>
        <div className="mini">
          {clinica.direccion ? `${clinica.direccion}, ${clinica.cp || ''} ${clinica.ciudad || ''}` : ''}
          {clinica.nif ? ` · NIF ${clinica.nif}` : ''}
        </div>
        <div className="mini">{clinica.email || ''}</div>
      </div>
      <div className="mini">{hoyLargo()}</div>
    </div>
  );
}
