import { createContext, useContext, useEffect, useState, Fragment, type ReactNode } from "react";
import { Center, Loader } from "@mantine/core";
import { notifyError } from "../lib/notify";
import { getLang, setLangGlobal, t, type Lang } from "./index";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "cs",
  setLang: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/**
 * Drží aktivní jazyk a při změně remountuje celý podstrom (key=lang) —
 * jednoduché a spolehlivé: přeloží se i texty mimo React subscription.
 * Katalog se dotahuje líně; remount proběhne až po jeho načtení. Při prvním
 * loadu s uloženým ne-českým jazykem se do načtení katalogu renderuje loader
 * (jinak by UI bliklo češtinou a stránky by fetchovaly dvakrát).
 */
export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang());
  const [ready, setReady] = useState(getLang() === "cs");

  useEffect(() => {
    if (ready) return;
    void setLangGlobal(getLang())
      .catch(() => {
        // Katalog se nepodařilo stáhnout (offline) — pojede se česky.
        setLangState("cs");
      })
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = (next: Lang) => {
    void setLangGlobal(next)
      .then((applied) => {
        // Zastaralý požadavek (mezitím novější přepnutí) se zahazuje.
        if (applied) setLangState(next);
      })
      .catch(() => {
        // Selhání importu katalogu = téměř vždy stará záložka po deployi
        // (chunk už neexistuje). Jednou obnovit na čerstvý build — volba je
        // v localStorage, po reloadu se jazyk načte sám. Hláška až když
        // nepomohl ani reload (skutečný výpadek sítě).
        const KEY = "lang-reload-at";
        const last = Number(sessionStorage.getItem(KEY) ?? 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          try { localStorage.setItem("landing-lang", next); } catch { /* private mode */ }
          window.location.reload();
          return;
        }
        notifyError(t("Jazyk se nepodařilo načíst — zkontroluj připojení."));
      });
  };

  if (!ready) {
    return (
      <Center h="100vh">
        <Loader color="teal" />
      </Center>
    );
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}
