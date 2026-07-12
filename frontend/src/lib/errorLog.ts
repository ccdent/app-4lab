// =============================================================================
// errorLog — globální ring buffer posledních JS chyb pro „Nahlásit problém"
// =============================================================================
// Pasivní sběr window.onerror / unhandledrejection do paměti (max 20 záznamů,
// stack zkrácený). Nikam se neodesílá samo — čte ho až ReportProblemModal,
// který chyby přibalí do hlášení pro snazší debug.
// =============================================================================

export interface LoggedError {
  ts: string; // ISO timestamp
  message: string;
  stack?: string;
}

const MAX_ERRORS = 20;
const MAX_STACK_CHARS = 500;

const buffer: LoggedError[] = [];

function push(message: string, stack?: string) {
  buffer.push({
    ts: new Date().toISOString(),
    message: message.slice(0, 500),
    stack: stack ? stack.slice(0, MAX_STACK_CHARS) : undefined,
  });
  if (buffer.length > MAX_ERRORS) buffer.shift();
}

let installed = false;

/** Nainstaluje globální error listenery. Volat jednou, před renderem (main.tsx).
 *  Idempotentní (guard proti dvojímu volání např. při HMR). */
export function installErrorLog() {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => {
    const err = e.error as unknown;
    push(
      e.message || String(err) || "Unknown error",
      err instanceof Error ? err.stack : undefined,
    );
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as unknown;
    push(
      reason instanceof Error ? reason.message : `Unhandled rejection: ${String(reason)}`,
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}

/** Ruční zápis chyby do bufferu. Používá AppErrorBoundary — render chyby,
 *  které boundary zachytí, už NEprojdou window.onerror, takže by se bez
 *  tohoto zápisu do „Nahlásit problém" kontextu vůbec nedostaly. */
export function logError(message: string, stack?: string) {
  push(message, stack);
}

/** Posledních ~20 zachycených chyb (nejstarší první). */
export function getRecentErrors(): LoggedError[] {
  return [...buffer];
}
