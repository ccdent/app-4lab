// Sdílené konstanty a helpery materiálového modulu (mimo komponentové soubory
// kvůli Fast Refresh).

export const STATUS_COLORS: Record<string, string> = {
  active: "teal",
  used: "blue",
  consumed: "gray",
  discarded: "red",
};
export const STATUS_LABELS: Record<string, string> = {
  active: "Aktivní",
  used: "Použitý",
  consumed: "Spotřebovaný",
  discarded: "Vyřazený",
};
export const MODE_LABELS: Record<string, string> = {
  reusable_lot: "Opakovaný",
  one_time: "Jednorázový",
};

/** Jednorázové šarže sdílí sentinel XXXX (v DB s unikátním sufixem). */
export function displayShortCode(row: { shortCode: string | null; consumptionMode: string | null }): string {
  if (!row.shortCode) return "—";
  return row.consumptionMode === "one_time" ? "XXXX" : row.shortCode;
}

/** České skloňování: 1 návrh, 2–4 návrhy, 5+ návrhů. */
export function navrhyLabel(n: number): string {
  if (n === 1) return "návrh";
  if (n >= 2 && n <= 4) return "návrhy";
  return "návrhů";
}
