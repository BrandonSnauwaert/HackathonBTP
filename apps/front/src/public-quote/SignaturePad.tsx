import { useEffect, useRef, useState, type PointerEvent } from "react";

/** Taille de l'image envoyée : assez nette pour l'impression, légère (quelques Ko de PNG). */
const WIDTH = 600;
const HEIGHT = 200;

/**
 * Zone de signature au doigt (ou à la souris). `onChange` reçoit l'image PNG en data URL,
 * ou null quand la zone est vide. Fond transparent : la signature se pose sur le document.
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(canvas.current as HTMLCanvasElement).color;
  }, []);

  /** Position dans le repère du canvas (600 × 200), quelle que soit sa taille à l'écran. */
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT };
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    // Un simple appui laisse un point.
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const next = point(e);
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvas.current?.toDataURL("image/png") ?? null);
  };

  const clear = () => {
    const ctx = canvas.current?.getContext("2d");
    ctx?.clearRect(0, 0, WIDTH, HEIGHT);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="pq-signpad">
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        aria-label="Zone de signature : signez avec le doigt ou la souris"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {empty ? (
        <span className="pq-signpad-hint" aria-hidden="true">
          Signez ici
        </span>
      ) : (
        <button type="button" className="pq-signpad-clear" onClick={clear}>
          Effacer
        </button>
      )}
    </div>
  );
}
