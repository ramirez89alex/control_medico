import { useRef, useState } from 'react';

interface Props {
  onGuardar: (blob: Blob) => void;
  guardando?: boolean;
}

/** Canvas de firma táctil/ratón, portado de `iniciarFirma`/`guardarFirma` del HTML original. */
export function FirmaCanvas({ onGuardar, guardando }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dibujandoRef = useRef(false);
  const [vacia, setVacia] = useState(true);

  function inicializar(canvas: HTMLCanvasElement | null) {
    if (!canvas || canvasRef.current === canvas) return;
    canvasRef.current = canvas;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#242A4D';
    ctxRef.current = ctx;
  }

  function posicion(e: React.PointerEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top] as const;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujandoRef.current = true;
    setVacia(false);
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(...posicion(e));
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujandoRef.current) return;
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.lineTo(...posicion(e));
    ctx.stroke();
  }

  function onPointerUp() {
    dibujandoRef.current = false;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVacia(true);
  }

  function guardar() {
    const canvas = canvasRef.current;
    if (!canvas || vacia) return;
    canvas.toBlob((blob) => {
      if (blob) onGuardar(blob);
    }, 'image/png');
  }

  return (
    <div>
      <canvas
        ref={inicializar}
        className="firma-box"
        style={{ width: '100%', height: 150 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <div className="fila" style={{ marginTop: 8 }}>
        <button type="button" className="btn gh sm" onClick={limpiar}>
          Limpiar
        </button>
        <button type="button" className="btn pri sm" disabled={vacia || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar firma'}
        </button>
        <span className="mini">Se registra fecha y hora.</span>
      </div>
    </div>
  );
}
