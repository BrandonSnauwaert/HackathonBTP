import { useEffect } from "react";

/**
 * Garde l'écran allumé tant que `active` est vrai : sur iOS, le micro se coupe quand l'écran se verrouille.
 * Le verrou est rendu par le navigateur quand la page passe en arrière-plan : on le redemande au retour.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (cancelled) void sentinel.release();
          else lock = sentinel;
        },
        () => undefined, // Refusé (économie d'énergie...) : sans conséquence.
      );
    };

    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [active]);
}
