import type { Context } from "hono";
import type { ZodType } from "zod";

/** Jednotný tvar chybové odpovědi: { error: { code, message } }. */
export function apiError(
  c: Context,
  status: 400 | 403 | 404 | 409,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}

export function now(): number {
  return Date.now();
}

export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Zvaliduje JSON body proti zod schématu. Při chybě vrací null a odpověď
 * poslal caller přes vrácený Response — použití:
 *   const body = await parseBody(c, schema);
 *   if (body instanceof Response) return body;
 */
export async function parseBody<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return apiError(c, 400, "INVALID_JSON", "Tělo požadavku není platný JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "(root)";
    return apiError(c, 400, "VALIDATION", `${path}: ${issue?.message ?? "neplatná hodnota"}`);
  }
  return parsed.data;
}
