// =============================================================================
// Typovaný fetch klient pro Worker API (náhrada Supabase klienta z crm-mvp).
// Autentizaci řeší Cloudflare Access před aplikací — klient neposílá žádné
// tokeny, jen cookies (Access JWT cookie jde s requestem automaticky).
// =============================================================================

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      if (data.error?.code) code = data.error.code;
      if (data.error?.message) message = data.error.message;
    } catch {
      // ne-JSON odpověď (např. HTML od Cloudflare Access při vypršelé session)
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  // 200 + HTML = redirect na login Cloudflare Access (vypršelá session).
  if (!res.headers.get("Content-Type")?.includes("json")) {
    throw new ApiError(401, "SESSION_EXPIRED", "Přihlášení vypršelo — obnov stránku (F5).");
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
