import { useState } from "react";

/** Thème de l'application : celui du téléphone par défaut, ou forcé par l'artisan (Mon entreprise). */
export type ThemeChoice = "auto" | "light" | "dark";

const KEY = "devis-vocal:theme";

function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

/** `data-theme` sur <html> : absent = selon le système (prefers-color-scheme), sinon forcé. */
export function applyTheme(choice: ThemeChoice) {
  if (choice === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [theme, setTheme] = useState(readTheme);
  const change = (choice: ThemeChoice) => {
    try {
      if (choice === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      // Stockage indisponible : le choix vaut pour cette session seulement.
    }
    applyTheme(choice);
    setTheme(choice);
  };
  return [theme, change];
}

/** À appeler avant le premier rendu, pour éviter un flash du mauvais thème. */
export const initTheme = () => applyTheme(readTheme());
