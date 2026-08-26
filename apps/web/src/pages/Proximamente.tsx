interface Props {
  titulo: string;
  descripcion: string;
}

export function Proximamente({ titulo, descripcion }: Props) {
  return (
    <div>
      <div className="topbar">
        <div>
          <h1>{titulo}</h1>
          <p>{descripcion}</p>
        </div>
      </div>
      <div className="card vacio">Esta sección llega en una fase siguiente de la reconstrucción.</div>
    </div>
  );
}
