/** Barres de niveau du micro (maquette : « J'écoute » + barres). Immobiles quand rien n'est capté. */
const SHAPE = [0.3, 0.65, 1, 0.45, 0.85, 0.3, 0.6, 0.9, 0.4];

export function LevelBars({ level, active }: { level: number; active: boolean }) {
  const amplitude = active ? Math.min(1, level * 8) : 0;
  return (
    <div className="bars" aria-hidden="true">
      {SHAPE.map((factor, i) => (
        <span key={i} style={{ height: `${4 + Math.round(24 * factor * amplitude)}px` }} />
      ))}
    </div>
  );
}
