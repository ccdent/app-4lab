/**
 * Osobní pozdrav pro Feed — denní doba + křestní jméno v 5. pádu.
 *
 * Vokativ se generuje pravidly podle zakončení (pokrývají běžná česká křestní
 * jména; viz tabulka níže). Neznámé/cizí tvary propadnou beze změny — to není
 * chyba, jen míň osobní oslovení („Dobré ráno, Kim."). Příjmení se zahazuje.
 */

/** Ženská jména končící souhláskou — vokativ beze změny a rodový signál F
 *  (jinak by dostala mužské koncovky: „Dagmare"). Otevřená třída — nepokrytá
 *  jména dostanou mužské pravidlo; seznam rozšiřuj podle reálných uživatelů. */
const FEMALE_CONSONANT = new Set([
  "dagmar", "ester", "miriam", "ingrid", "ruth", "karin", "kim", "nikol",
  "doris", "iris", "šarlot", "elen", "karen", "rachel", "ellen", "ines",
  "margit", "judit", "ivet", "dorot",
]);

/** Mužská jména končící na -a/-e/-o (výjimky ženského pravidla). */
const MALE_VOWEL_FIRST = new Set([
  "rené", "honza", "jarda", "ondra", "míra", "pepa", "kuba", "franta",
  "tonda", "standa", "láďa", "jirka", "ruda", "ilja", "nikita", "sváťa",
]);

/** Jména používaná pro oba rody — rodový signál null (radši fallback). */
const AMBIGUOUS_FIRST = new Set(["saša", "míša", "nikola", "luca", "andrea"]);

/** Výjimky vokativu, kde obecné pravidlo dává špatný tvar. */
const EXCEPTIONS: Record<string, string> = {
  pavel: "Pavle",
  karel: "Karle",
};

/** Tituly (normalizované: lowercase, bez teček/číslic), které se odstřihnou
 *  ze začátku display_name. `-` a `et` jsou spojky v titulech. */
const TITLE_TOKENS = new Set([
  "mudr", "mddr", "dr", "prof", "doc", "phd", "md", "dmd", "bc", "mgr",
  "ing", "rndr", "pharmdr", "judr", "paeddr", "thdr", "msc", "mba", "dis",
  "csc", "drsc", "et", "-", "lékař", "lékařka", "stomatolog",
  "stomatoložka", "zubní",
]);

function stripTitles(displayName: string): string[] {
  const tokens = displayName.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && TITLE_TOKENS.has(tokens[i].toLowerCase().replace(/[.\d]/g, ""))) i++;
  return tokens.slice(i);
}

/** Vypadá zbytek jména jako fyzická osoba? (firmy/testovací účty → false) */
function looksLikePerson(tokens: string[]): boolean {
  if (tokens.length < 2 || tokens.length > 4) return false;
  const joined = tokens.join(" ");
  if (/(labo?r|dent|smile|studio|klinik|clinic|s\.r\.o|design)/i.test(joined)) return false;
  // Jen VELKÁ písmena (\p{Lu}) — rozsah [Á-Ž] by chytal i malou diakritiku
  // (á,č,ř…) a zamítal běžná příjmení jako „Dvořáčková".
  if (/\p{Lu}{3,}/u.test(joined)) return false; // ALLCAPS slovo
  if (/\d/.test(joined)) return false; // číslice ve jméně
  for (let i = 1; i < tokens.length; i++) if (tokens[i] === tokens[i - 1]) return false; // „Unidens Unidens"
  return true;
}

/** Křestní jméno (první token po odstřižení titulů) v 5. pádu; neosobní/
 *  podezřelý tvar (firma, token s tečkou/číslicí) vrací celé jméno beze změny. */
export function vocativeFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  const tokens = stripTitles(trimmed);
  const first = tokens[0] ?? "";
  // Servisní/sdílené účty a neodstřižené tituly nikdy neskloňovat — celé jméno.
  if (first.length < 2 || /[.\d@]/.test(first)) return trimmed;
  if (/(labo?r|dent|smile|studio|klinik|clinic|s\.r\.o|design|recepce)/i.test(trimmed)) return trimmed;
  if (tokens.length > 1 && !looksLikePerson(tokens)) return trimmed;
  const lower = first.toLowerCase();

  const exception = EXCEPTIONS[lower];
  if (exception) return exception;
  if (FEMALE_CONSONANT.has(lower) || AMBIGUOUS_FIRST.has(lower) || MALE_VOWEL_FIRST.has(lower)) {
    // Známá jména mimo pravidla: Dagmar/Kim beze změny; Honza→Honzo řeší -a
    // pravidlo níž jen u mužských na -a, u ostatních je bezpečnější nechat být.
    if (lower.endsWith("a")) return first.slice(0, -1) + "o"; // Honza→Honzo, Saša→Sašo
    return first;
  }

  // samohláskové konce
  if (lower.endsWith("a")) return first.slice(0, -1) + "o"; // Jana→Jano
  if (/[eéiíoóuúůyý]$/.test(lower)) return first; // Lucie, Jiří, Hugo, Harry…

  // souhláskové konce (mužská jména)
  if (lower.endsWith("něk")) return first.slice(0, -3) + "ňku"; // Zdeněk→Zdeňku
  if (lower.endsWith("ek")) return first.slice(0, -2) + "ku"; // Marek→Marku
  if (/[kgh]$/.test(lower) || lower.endsWith("ch")) return first + "u"; // Patrik→Patriku, Vojtěch→Vojtěchu
  if (lower.endsWith("el")) return first + "i"; // Daniel→Danieli (Pavel/Karel viz výjimky)
  if (/[šžčřjň]$/.test(lower)) return first + "i"; // Tomáš→Tomáši, Ondřej→Ondřeji
  if (/[sxc]$/.test(lower)) return first + "i"; // Denis→Denisi, Max→Maxi
  if (lower.endsWith("r")) {
    // po souhlásce r→ře (Petr→Petře), po samohlásce +e (Viktor→Viktore)
    const beforeR = lower[lower.length - 2];
    return /[aeiouáéíóúůyý]/.test(beforeR) ? first + "e" : first.slice(0, -1) + "ře";
  }
  if (/[bdflmnptvz]$/.test(lower)) return first + "e"; // Jakub→Jakube, Martin→Martine

  return first;
}

/** Pozdrav podle denní doby (lokální čas prohlížeče). */
export function greetingForNow(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 4 && h < 9) return "Dobré ráno";
  if (h >= 9 && h < 12) return "Dobré dopoledne";
  if (h >= 12 && h < 18) return "Dobré odpoledne";
  return "Dobrý večer";
}

/* ────────────────────────── Oslovení doktora ──────────────────────────
 * „pane doktore" / „paní doktorko" — jméno se NIKDY neskloňuje (příjmení
 * jsou moc rozmanitá). Rod se odvozuje kaskádou signálů; jakákoli nejistota
 * (firma místo osoby, konflikt signálů, cizí jméno bez koncovky) vrací null
 * → volající použije neutrální fallback s celým jménem. Ověřeno na reálné
 * DB doktorů (staging, 77 řádků). */

type Gender = "M" | "F";

function firstNameSignal(first: string): Gender | null {
  const f = first.toLowerCase();
  if (AMBIGUOUS_FIRST.has(f)) return null; // Saša, Nikola… — oba rody
  if (MALE_VOWEL_FIRST.has(f)) return "M";
  if (FEMALE_CONSONANT.has(f)) return "F"; // Ester, Miriam — jinak by spadly do souhlásek
  if (/(a|ie|e)$/.test(f)) return "F"; // Klára, Lucie, Alice
  if (/[bcdfghjklmnprstvzřšžčňďťýí]$/.test(f)) return "M"; // souhláska/adjektivum; -í = Jiří
  return null; // Sergii, …
}

function surnameSignal(surname: string): Gender | null {
  const l = surname.toLowerCase();
  if (/ov[aá]$/.test(l)) return "F"; // Nováková i nepřechýlené Hamadova
  if (/á$/.test(l)) return "F"; // Holá
  if (/ý$/.test(l)) return "M"; // Dlouhý
  return null;
}

/**
 * „pane doktore" / „paní doktorko" podle display_name doktora, nebo null
 * když si nejsme jistí (→ použij celé jméno beze změny).
 */
export function doctorSalutation(displayName: string): string | null {
  const tokens = stripTitles(displayName);
  if (!looksLikePerson(tokens)) return null;
  const first = firstNameSignal(tokens[0]);
  const last = surnameSignal(tokens[tokens.length - 1]);
  if (first && last && first !== last) return null; // konflikt („Ivan Kratochvílová")
  const gender = last ?? first;
  if (gender === "M") return "pane doktore";
  if (gender === "F") return "paní doktorko";
  return null;
}
