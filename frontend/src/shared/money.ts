import { formatCzk } from "./currency";

// Peníze se v DB (D1/SQLite) drží jako INTEGER haléře.
// FE pracuje v Kč (NumberInput s desetinnými místy) — tady jsou převody.

/** Haléře → Kč (číslo pro inputy/výpočty na FE). */
export function halereToKc(halere: number): number {
  return halere / 100;
}

/** Kč (i desetinné) → haléře pro API payload. */
export function kcToHalere(kc: number): number {
  return Math.round(kc * 100);
}

/** Haléře → „8 500 Kč" (celé Kč; ceník je v celých korunách). */
export function formatHalere(halere: number): string {
  return formatCzk(halere / 100);
}
