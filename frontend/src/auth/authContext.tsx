// =============================================================================
// Auth kontext — identita přihlášeného technika.
// Cloudflare Access ověřil uživatele PŘED aplikací; tady se jen dotáhne
// odpovídající řádek `technician` z API (/api/me). Neznámý e-mail → 403
// a zobrazí se vysvětlující obrazovka (účet musí založit správce).
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button, Center, Loader, Stack, Text } from "@mantine/core";
import { api, ApiError } from "../api/client";
import { t } from "../i18n";

export interface Perms {
  ordersViewAll: boolean;
  ordersCreateForOthers: boolean;
  doctorsEdit: boolean;
  priceListEdit: boolean;
  materialsEdit: boolean;
}

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'technician' | 'lead';
  perms: Perms;
}

interface AuthContextValue {
  me: Me;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/me"));
      setError(null);
      sessionStorage.removeItem("auth-reloaded");
    } catch (e) {
      // Vypršelá/zneplatněná Access session: fetch neumí interaktivní login,
      // ale plné načtení dokumentu ano — jednou to zkusíme automaticky
      // (sessionStorage guard proti reload smyčce, kdyby login neprošel).
      if (
        e instanceof ApiError &&
        (e.code === "SESSION_EXPIRED" || e.status === 401) &&
        !sessionStorage.getItem("auth-reloaded")
      ) {
        sessionStorage.setItem("auth-reloaded", "1");
        window.location.reload();
        return;
      }
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error === "forbidden") {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="md" maw={480} p="xl">
          <Text fw={600} size="lg">
            {t("Účet není zaregistrovaný")}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {t("Přihlášení proběhlo, ale tento e-mail nemá v aplikaci založený účet technika. Požádejte správce laboratoře o přidání.")}
          </Text>
        </Stack>
      </Center>
    );
  }

  if (error === "failed") {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="md" maw={480} p="xl">
          <Text fw={600} size="lg">
            {t("Aplikace není dostupná")}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {t("Nepodařilo se načíst přihlášeného uživatele. Zkuste to za chvíli znovu.")}
          </Text>
          <Button onClick={() => window.location.reload()}>{t("Zkusit znovu")}</Button>
        </Stack>
      </Center>
    );
  }

  if (!me) {
    return (
      <Center mih="100vh">
        <Loader color="teal" />
      </Center>
    );
  }

  return <AuthContext.Provider value={{ me, refresh }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth musí být použit uvnitř AuthProvider");
  return ctx;
}
