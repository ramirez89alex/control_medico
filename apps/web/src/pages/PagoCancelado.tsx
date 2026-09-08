export function PagoCancelado() {
  return (
    <div className="portada" style={{ paddingTop: '15vh' }}>
      <img className="plogo" src="/icon-192.png" alt="PowerDent" />
      <div className="pcard" style={{ maxWidth: 420, margin: '20px auto 0', cursor: 'default', textAlign: 'center' }}>
        <h3>Pago cancelado</h3>
        <p className="mini">No se ha realizado ningún cargo. Si ha sido un error, pide un nuevo enlace en la clínica.</p>
      </div>
    </div>
  );
}
