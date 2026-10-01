import type { CSSProperties } from "react";

/**
 * Squelettes de chargement : la forme de l'écran apparaît tout de suite, avec un reflet qui passe,
 * au lieu d'un « Chargement… ». Ils reprennent les classes des vrais composants (.qrow, .card, .kpis) :
 * le contenu prend leur place sans que la page saute.
 */
export function Skeleton({
  w = "100%",
  h = 16,
  r,
  style,
}: {
  w?: string | number;
  h?: number;
  r?: number;
  style?: CSSProperties;
}) {
  return <span className="sk" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Lignes de devis (carte sur téléphone, ligne de tableau sur ordinateur). */
export function QuoteRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="qrow card sk-row" aria-hidden="true" style={{ "--i": i } as CSSProperties}>
          <span className="q-name">
            <Skeleton w={`${70 - ((i * 13) % 30)}%`} h={18} />
          </span>
          <span className="q-amount r">
            <Skeleton w={84} h={18} />
          </span>
          <span className="q-status">
            <Skeleton w={92} h={26} r={999} />
          </span>
          <span className="q-activity">
            <Skeleton w={120} h={14} />
          </span>
        </div>
      ))}
    </>
  );
}

/** Cartes de clients (avatar, nom, coordonnées, chiffres). */
export function ClientRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card crow sk-row" aria-hidden="true" style={{ "--i": i } as CSSProperties}>
          <Skeleton w={36} h={36} r={999} />
          <div className="grow sk-stack">
            <Skeleton w={`${55 - ((i * 11) % 25)}%`} h={18} />
            <Skeleton w="75%" h={14} />
          </div>
          <div className="c-stats sk-stack">
            <Skeleton w={70} h={16} />
            <Skeleton w={50} h={13} />
          </div>
        </div>
      ))}
    </>
  );
}

/** Tuiles de chiffres et graphiques des statistiques. */
export function StatsSkeleton() {
  return (
    <>
      <div className="kpis" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card kpi sk-row" style={{ "--i": i } as CSSProperties}>
            <Skeleton w="60%" h={14} />
            <Skeleton w="45%" h={28} style={{ marginTop: 6 }} />
            <Skeleton w="80%" h={12} style={{ marginTop: 4 }} />
          </div>
        ))}
      </div>
      <div className="card pad sk-row" aria-hidden="true" style={{ "--i": 4 } as CSSProperties}>
        <Skeleton w="35%" h={18} />
        <Skeleton h={180} r={12} />
      </div>
    </>
  );
}

/**
 * Écran entier en cours de chargement (devis, envoi, suivi, visite, fiche client, profil) :
 * en-tête, quelques cartes et la barre du bas. Affiche l'erreur à la place si le chargement a échoué.
 */
export function ScreenSkeleton({ error = null }: { error?: string | null }) {
  if (error) return <p className="loading error-text">{error}</p>;
  return (
    <div className="screen" aria-busy="true" aria-label="Chargement">
      <header className="hd">
        <Skeleton w={90} h={20} />
        <Skeleton w="55%" h={34} r={10} style={{ marginTop: 4 }} />
        <Skeleton w="35%" h={16} />
      </header>
      <div className="bd">
        <div className="card pad sk-row" style={{ "--i": 0 } as CSSProperties}>
          <Skeleton w="40%" h={18} />
          <Skeleton w="85%" h={14} />
          <Skeleton w="65%" h={14} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card sk-row" style={{ "--i": i } as CSSProperties}>
            <div className="row">
              <Skeleton w={`${60 - i * 8}%`} h={18} />
              <Skeleton w={70} h={18} />
            </div>
            <Skeleton w="45%" h={14} />
          </div>
        ))}
        <div className="card sk-row sk-totals" style={{ "--i": 4 } as CSSProperties}>
          <div className="row">
            <Skeleton w="30%" h={16} />
            <Skeleton w={90} h={16} />
          </div>
          <div className="row">
            <Skeleton w="38%" h={24} />
            <Skeleton w={120} h={24} />
          </div>
        </div>
      </div>
      <footer className="ft only-mobile">
        <Skeleton h={56} r={14} />
      </footer>
    </div>
  );
}

/** Démarrage de l'application, le temps de vérifier la session : logo animé. */
export function AppSplash() {
  return (
    <div className="splash" aria-busy="true" aria-label="Chargement de BatiDevis">
      <div className="splash-logo ic logo">BD</div>
      <div className="splash-name b">BatiDevis</div>
      <div className="splash-bar">
        <span />
      </div>
    </div>
  );
}
