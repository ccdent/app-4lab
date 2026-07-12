export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" renders the confirm button red (delete / destructive). */
  variant?: "default" | "danger";
}

interface ProviderState {
  open: boolean;
  opts?: ConfirmOptions;
}

type Setter = (s: ProviderState) => void;

let providerSet: Setter | null = null;
let pending: ((value: boolean) => void) | null = null;

export function registerConfirmProvider(setter: Setter | null) {
  providerSet = setter;
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!providerSet) {
      // Provider not mounted (tests / SSR fallback) — refuse rather than silently confirm.
      resolve(false);
      return;
    }
    if (pending) {
      // Concurrent confirm — reject the older one to avoid leaks.
      pending(false);
    }
    pending = resolve;
    providerSet({ open: true, opts });
  });
}

export function resolveConfirm(value: boolean) {
  const resolver = pending;
  pending = null;
  providerSet?.({ open: false });
  resolver?.(value);
}
