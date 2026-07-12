// =============================================================================
// Lehká i18n vrstva — čeština je zdrojový text i klíč (gettext styl).
// t("Nová zakázka") vrátí překlad podle aktivního jazyka; chybějící překlad
// = fallback na češtinu, takže nepřeložený text nikdy nerozbije UI.
//
// Katalogy se načítají LÍNĚ (dynamic import) — do hlavního bundlu se
// nebalí žádný jazyk; čeština nepotřebuje katalog vůbec. Přepnutí jazyka
// remountuje strom pod <LanguageProvider> až PO načtení katalogu.
// =============================================================================

export type Lang = "cs" | "sk" | "en" | "de";

/** Sdílený klíč s landing page — jazyk zvolený před přihlášením se přenese. */
const STORAGE_KEY = "landing-lang";

export const LANGS: { value: Lang; flag: string; label: string }[] = [
  { value: "cs", flag: "🇨🇿", label: "Čeština" },
  { value: "sk", flag: "🇸🇰", label: "Slovenčina" },
  { value: "en", flag: "🇬🇧", label: "English" },
  { value: "de", flag: "🇩🇪", label: "Deutsch" },
];

const LOADERS: Record<Exclude<Lang, "cs">, () => Promise<{ dict: Record<string, string> }>> = {
  sk: async () => ({ dict: (await import("./sk")).sk }),
  en: async () => ({ dict: (await import("./en")).en }),
  de: async () => ({ dict: (await import("./de")).de }),
};

function loadStoredLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "cs" || saved === "sk" || saved === "en" || saved === "de") return saved;
  return "cs";
}

let current: Lang = loadStoredLang();
let dict: Record<string, string> | null = null;
/** Epoch guard: rychlé dvojité přepnutí — vyhrává poslední požadavek. */
let epoch = 0;

export function getLang(): Lang {
  return current;
}

/**
 * Nastaví jazyk a dotáhne katalog; resolve `true` = jazyk je aktivní.
 * `false` = požadavek zastaral (mezitím přišlo novější přepnutí).
 * Selhání importu (offline) rejectne a jazyk se NEZMĚNÍ — localStorage
 * se zapisuje až po úspěšném načtení, aby se preference "neotrávila".
 */
export async function setLangGlobal(lang: Lang): Promise<boolean> {
  const seq = ++epoch;
  if (lang === "cs") {
    current = lang;
    dict = null;
    localStorage.setItem(STORAGE_KEY, lang);
    return true;
  }
  const loaded = await LOADERS[lang]();
  if (seq !== epoch) return false;
  current = lang;
  dict = loaded.dict;
  localStorage.setItem(STORAGE_KEY, lang);
  return true;
}

/** Překlad; volitelné {placeholder} hodnoty se dosadí po překladu. */
export function t(cs: string, vars?: Record<string, string | number>): string {
  const raw = current === "cs" || !dict ? cs : (dict[cs] ?? cs);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
