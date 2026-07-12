/**
 * Pomocné konstanty a funkce pro short_code skladové položky.
 *
 * Oddělené od ShortCodeSlotInput.tsx, aby Fast Refresh fungoval (komponentové
 * soubory smí exportovat jen komponenty).
 */

export const SHORT_CODE_SLOTS = 4;

/**
 * Normalizace short_code vstupu:
 *  - odstraní whitespace a pomlčky
 *  - uppercase
 *  - oříznutí na max SHORT_CODE_SLOTS znaků
 *
 * Stejná logika jako serverová `find_stock_item_by_short_code` RPC normalizace.
 */
export function normalizeShortCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase().slice(0, SHORT_CODE_SLOTS);
}
