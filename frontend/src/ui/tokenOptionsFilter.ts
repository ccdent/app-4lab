import type { ComboboxItem, ComboboxParsedItem, OptionsFilter } from "@mantine/core";
import { getSearchTokens, matchesSearchTokens } from "../shared/search";

/**
 * Tokenové + diakritika-insensitive filtrování pro Mantine `Select` / `MultiSelect`
 * / `Autocomplete` (prop `filter`). Nahrazuje Mantine default (shoda celého
 * řetězce), aby víceslovné a bezdiakritické dotazy fungovaly i v dropdownech.
 *
 * Postaveno na sdíleném helperu (`shared/search.ts`) — jediný zdroj pravidla.
 * Zvládá ploché položky i grupovaná data (`{ group, items }`); prázdné skupiny
 * po filtru zahazuje. Prázdný dotaz nefiltruje. Respektuje Mantine `limit`
 * (cap napříč skupinami) — parita s `defaultOptionsFilter`.
 *
 * Viz docs/ui/multi-word-search-prd.md.
 */
export const tokenOptionsFilter: OptionsFilter = ({ options, search, limit }) => {
  const tokens = getSearchTokens(search);
  const max = limit ?? Infinity;

  const matchItem = (item: ComboboxItem) =>
    tokens.length === 0 || matchesSearchTokens([item.label], tokens);

  const result: ComboboxParsedItem[] = [];
  let count = 0;
  for (const option of options) {
    if (count >= max) break;
    if ("group" in option) {
      const items: ComboboxItem[] = [];
      for (const it of option.items) {
        if (count >= max) break;
        if (matchItem(it)) {
          items.push(it);
          count += 1;
        }
      }
      if (items.length > 0) result.push({ ...option, items });
    } else if (matchItem(option)) {
      result.push(option);
      count += 1;
    }
  }
  return result;
};
