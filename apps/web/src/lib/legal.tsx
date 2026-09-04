export interface ClinicaLegal {
  nombre: string;
  nif: string | null;
  direccion: string | null;
  cp: string | null;
  ciudad: string | null;
  email: string | null;
}

export const CONSENTIMIENTOS = [
  ['datos', 'Consiento el tratamiento de mis datos personales y de salud para la asistencia sanitaria y su historia clínica (obligatorio).'],
  ['tratamiento', 'He sido informado/a del tratamiento propuesto, alternativas, riesgos y presupuesto, y lo consiento (obligatorio).'],
  ['imagenes', 'Autorizo radiografías, fotografías y escáneres intraorales con fines clínicos.'],
  ['comercial', 'Autorizo recordatorios de cita y comunicaciones de la clínica por SMS, email o WhatsApp.'],
] as const;

export function textoLegal(c: ClinicaLegal) {
  return (
    <>
      <h4>Responsable del tratamiento</h4>
      <p>
        {c.nombre}
        {c.nif ? ` · NIF ${c.nif}` : ''}
        {c.direccion ? ` · ${c.direccion}, ${c.cp || ''} ${c.ciudad || ''}` : ''}
        {c.email ? ` · ${c.email}` : ''}.
      </p>
      <h4>Finalidad</h4>
      <p>
        Prestación de asistencia odontológica, elaboración y conservación de la historia clínica, gestión de citas, presupuestos, facturación y
        trazabilidad de prótesis y material.
      </p>
      <h4>Legitimación</h4>
      <p>
        Ejecución del contrato de servicios sanitarios, cumplimiento de obligaciones legales (Ley 41/2002 de autonomía del paciente y documentación
        clínica) y consentimiento del interesado para las finalidades opcionales marcadas.
      </p>
      <h4>Conservación</h4>
      <p>
        La historia clínica se conserva un mínimo de 5 años desde el alta de cada proceso asistencial; los datos fiscales, durante los plazos
        legales aplicables.
      </p>
      <h4>Derechos</h4>
      <p>
        Acceso, rectificación, supresión, oposición, limitación y portabilidad, dirigiéndose por escrito al responsable con copia del documento de
        identidad. Puede reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).
      </p>
    </>
  );
}
