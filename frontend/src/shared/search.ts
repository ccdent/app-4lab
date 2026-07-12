/**
 * Sdílené tokenové vyhledávání pro lokální (frontendové) filtry.
 *
 * Jediný zdroj pravidla pro víceslovné hledání napříč aplikací — NEvytvářej
 * lokální varianty `splitSearch`/`tokenize`/`normalizeSearch`/`matchesAll`.
 *
 * Pravidlo (viz `docs/ui/multi-word-search-prd.md`):
 *  - dotaz se foldne (lowercase + odstranění diakritiky) a rozdělí na tokeny dle
 *    whitespace,
 *  - záznam odpovídá, pokud KAŽDÝ token najde shodu (substring) v ALESPOŇ jednom
 *    z prohledávaných polí — tokeny tedy mohou padnout do různých polí,
 *  - prázdný dotaz nefiltruje (vrací true),
 *  - žádný fuzzy / překlepy / stemming — jen substring per token.
 *
 * Diakritika-insensitive je tu schválně jen frontendová. Serverová RPC
 * `search_material_catalog` drží stejnou tokenovou AND sémantiku, ale diakritiku
 * foldne jen pokud je dostupný `unaccent` (viz PRD §9.2).
 */

/**
 * Normalizuje text pro hledání: čísla na string, odstranění diakritiky, lowercase.
 * Používá se POUZE pro porovnání — nemění uložená ani zobrazená data.
 * `null`/`undefined` → "".
 */
export function foldSearchText(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Rozloží uživatelský dotaz na foldnuté tokeny (bez prázdných).
 * `getSearchTokens("  Novák   Žirkon ")` → `["novak", "zirkon"]`.
 * Prázdný / null dotaz → `[]`.
 */
export function getSearchTokens(query: string | number | null | undefined): string[] {
  const folded = foldSearchText(query).trim();
  if (folded === "") return [];
  return folded.split(/\s+/).filter((t) => t !== "");
}

/**
 * Vrátí true, pokud každý token najde shodu v alespoň jednom poli.
 * Prázdné `tokens` → true (nefiltruje). `null`/`undefined` pole se ignorují.
 */
export function matchesSearchTokens(
  fields: Array<string | number | null | undefined>,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const foldedFields = fields
    .filter((f) => f != null && f !== "")
    .map((f) => foldSearchText(f));
  return tokens.every((token) => foldedFields.some((field) => field.includes(token)));
}

/**
 * Pohodlný wrapper: tokenizuje dotaz a rovnou ho porovná proti polím.
 * Vhodné, když nepotřebuješ tokeny memoizovat zvlášť.
 */
export function matchesSearchQuery(
  fields: Array<string | number | null | undefined>,
  query: string | number | null | undefined,
): boolean {
  return matchesSearchTokens(fields, getSearchTokens(query));
}
