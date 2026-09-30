import { describe, expect, it } from "vitest";
import { centsToInput, formatClock, formatFullDate, initials, parseEuros } from "./format";

describe("parseEuros", () => {
  it("lit les saisies françaises et anglaises en centimes", () => {
    expect(parseEuros("45")).toBe(4500);
    expect(parseEuros("45,5")).toBe(4550);
    expect(parseEuros("1 200.00")).toBe(120_000);
    expect(parseEuros("12,34 €")).toBe(1234);
  });

  it("arrondit au centime", () => {
    expect(parseEuros("0,105")).toBe(11);
  });

  it("renvoie null pour une saisie vide (prix à renseigner)", () => {
    expect(parseEuros("")).toBeNull();
    expect(parseEuros("  ")).toBeNull();
  });

  it("refuse le texte et les montants négatifs", () => {
    expect(parseEuros("abc")).toBeUndefined();
    expect(parseEuros("-5")).toBeUndefined();
  });
});

describe("centsToInput", () => {
  it("affiche des centimes dans un champ en euros, et rien pour un prix manquant", () => {
    expect(centsToInput(4550)).toBe("45,50");
    expect(centsToInput(0)).toBe("0,00");
    expect(centsToInput(null)).toBe("");
  });

  it("fait l'aller-retour avec parseEuros", () => {
    expect(parseEuros(centsToInput(123_456))).toBe(123_456);
  });
});

describe("formatFullDate", () => {
  it("accepte une date seule (AAAA-MM-JJ) sans la décaler d'un jour", () => {
    expect(formatFullDate("2026-10-09")).toBe("9 octobre 2026");
  });
});

describe("autres formats", () => {
  it("chronomètre et initiales", () => {
    expect(formatClock(65_000)).toBe("01:05");
    expect(initials("Martin Rénovation Lyon")).toBe("MR");
    expect(initials("")).toBe("?");
  });
});
