/**
 * Timezone-safe helpery pro "datum bez času".
 *
 * Problém (timezone drift): new Date('2025-03-15') vytvoří UTC půlnoc.
 * V časové zóně UTC+1/+2 se lokální datum při zobrazení posune na den dříve
 * (např. 2025-03-14T23:00:00 lokálně). Proto nikdy neparsujeme ISO string
 * přímo přes new Date(isoString), ale vždy přes lokální čísla roku/měsíce/dne.
 */

/**
 * Převede lokální Date na 'YYYY-MM-DD' podle lokálního kalendářního data.
 * Používá getFullYear/getMonth/getDate – vždy lokální zóna, žádný posun.
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parsuje 'YYYY-MM-DD' na Date nastavenou na lokální půlnoc.
 * new Date(year, month-1, day) vytvoří lokální půlnoc – bez timezone driftu.
 */
export function fromISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Vrátí dnešní datum jako Date na lokální půlnoc.
 * Používá se jako minDate v date pickerech – zabraňuje výběru minulých dat.
 */
export function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Lidsky čitelné datum „7. 6. 2026" (cs, D. M. YYYY). Prázdné/nevalidní → „—". */
export function formatDateCS(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

/** Skladové/expirační datum „07.07.2036" (DD.MM.YYYY — standard materiálového
 *  modulu, viz StockItemsPage/LotSelectPanel). Prázdné/nevalidní → „—". */
export function formatDateDDMMYYYY(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
