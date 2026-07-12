// =============================================================================
// AppErrorBoundary — ochranná síť proti „bílé obrazovce"
// =============================================================================
// Bez error boundary odmountuje jakákoli neodchycená výjimka v renderu CELÝ
// React strom → prázdný #root (bílá stránka, „zmizela data"). Boundary místo
// toho ukáže chybovou kartu s možností obnovení a chybu:
//   (a) zapíše do lib/errorLog (ring buffer pro diagnostiku),
//   (b) best-effort odešle do Workeru (/api/client-error) — objeví se
//       v Cloudflare logu (throttle proti spamu při opakovaném obnovování).
// Chybová hláška je ve fallbacku viditelná → i pouhý screenshot od uživatele
// nese diagnostiku.
//
// Použití (dvě úrovně):
//   - root (App.tsx, variant="fullscreen"): celá aplikace vč. providerů,
//     print routes a public stránek — poslední záchrana.
//   - page (AppLayout kolem <Outlet/>, variant="page", key={pathname}):
//     spadne jen obsah stránky, navigace/chrome přežije; přechod na jinou
//     routu boundary remountem resetuje.
//
// Pozn.: boundary chytá jen chyby v renderu/lifecycle. Chyby v event
// handlerech a async kódu bílou stránku nezpůsobí a sbírá je dál
// window.onerror/unhandledrejection v installErrorLog().
// =============================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Center, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { getRecentErrors, logError } from "../../lib/errorLog";
import { t } from "../../i18n";

// Throttle automatického hlášení — jeden pád může při opakovaném obnovování
// stránky generovat hlášení dokola; víc než 1× za 5 minut nemá hodnotu.
// Module-level záměrně (sdílené mezi root i page boundary instancemi).
const AUTO_REPORT_MIN_INTERVAL_MS = 5 * 60_000;
let lastAutoReportAt = 0;

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/** Best-effort odeslání pádu do Worker logu. Nikdy nevyhazuje — pád hlášení
 *  nesmí shodit fallback UI. */
function autoReportCrash(error: unknown, componentStack: string | null): void {
  const now = Date.now();
  if (now - lastAutoReportAt < AUTO_REPORT_MIN_INTERVAL_MS) return;
  lastAutoReportAt = now;
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: toMessage(error).slice(0, 2000),
        route: window.location.pathname + window.location.search,
        userAgent: navigator.userAgent,
        stack: error instanceof Error ? (error.stack?.slice(0, 2000) ?? null) : null,
        componentStack: componentStack?.slice(0, 1500) ?? null,
        recentErrors: getRecentErrors(),
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

interface Props {
  /** fullscreen = root boundary (celý viewport), page = obsah pod AppLayout */
  variant: "fullscreen" | "page";
  children: ReactNode;
}

interface State {
  error: unknown | null;
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Do ring bufferu — boundary chybu spolkne, window.onerror ji už neuvidí.
    logError(
      `[render] ${toMessage(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    autoReportCrash(error, info.componentStack ?? null);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const content = (
      <Stack align="center" gap="md" maw={480} p="xl">
        <IconAlertTriangle size={40} color="#E8590C" />
        <Text fw={600} size="lg" c="light-dark(#111827, #ececec)" ta="center">
          {t("Něco se pokazilo")}
        </Text>
        <Text size="sm" c="light-dark(#4b5563, #b5b5b5)" ta="center">
          {t("V aplikaci nastala neočekávaná chyba a stránku se nepodařilo vykreslit. Vaše data jsou v bezpečí — zkuste stránku obnovit.")}
        </Text>
        <Text size="xs" c="light-dark(#9ca3af, #7a7a7a)" ff="monospace" ta="center" style={{ wordBreak: "break-word" }}>
          {toMessage(this.state.error)}
        </Text>
        <Group gap="sm">
          <Button color="teal" onClick={() => window.location.reload()}>
            {t("Obnovit stránku")}
          </Button>
          <Button variant="default" onClick={() => window.location.assign("/app/feed")}>
            {t("Zpět na úvod")}
          </Button>
        </Group>
      </Stack>
    );

    return this.props.variant === "fullscreen" ? (
      <Center mih="100vh">{content}</Center>
    ) : (
      <Center py={80}>{content}</Center>
    );
  }
}
