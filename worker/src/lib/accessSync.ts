// Synchronizace Cloudflare Access policy se seznamem aktivních techniků.
// Založení/deaktivace technika v aplikaci = přidání/odebrání e-mailu
// v Access policy (jinak by se musel spravovat ručně v Zero Trust dashboardu).
//
// Token: worker secret ACCESS_SYNC_TOKEN (wrangler secret put) — ideálně
// scoped jen na „Access: Apps and Policies — Edit".

export interface AccessSyncEnv {
  CF_ACCOUNT_ID?: string;
  ACCESS_APP_ID?: string;
  ACCESS_POLICY_ID?: string;
  ACCESS_SYNC_TOKEN?: string;
}

export type AccessSyncResult =
  | { ok: true }
  | { ok: false; error: string }
  | null; // null = sync není nakonfigurovaný (lokální vývoj) — neřešit

export async function syncAccessPolicy(
  env: AccessSyncEnv,
  activeEmails: string[],
): Promise<AccessSyncResult> {
  if (!env.CF_ACCOUNT_ID || !env.ACCESS_APP_ID || !env.ACCESS_POLICY_ID || !env.ACCESS_SYNC_TOKEN) {
    return null;
  }
  // Pojistka proti zamčení všech: prázdný seznam nikdy nesynchronizovat.
  if (activeEmails.length === 0) {
    return { ok: false, error: "Žádný aktivní technik — policy nezměněna (pojistka)." };
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${env.ACCESS_APP_ID}/policies/${env.ACCESS_POLICY_ID}`;
  const headers = {
    Authorization: `Bearer ${env.ACCESS_SYNC_TOKEN}`,
    "Content-Type": "application/json",
  };

  try {
    // Načíst současnou policy (zachovat název, decision, require/exclude…).
    const getRes = await fetch(base, { headers });
    const current = (await getRes.json()) as {
      success: boolean;
      result?: Record<string, unknown>;
      errors?: { message: string }[];
    };
    if (!getRes.ok || !current.success || !current.result) {
      return { ok: false, error: current.errors?.[0]?.message ?? `GET policy ${getRes.status}` };
    }

    // Zachovat i volitelná nastavení policy (session_duration, approval…),
    // jinak by je každý sync resetoval na defaulty.
    const keep: Record<string, unknown> = {};
    for (const k of [
      "session_duration",
      "approval_required",
      "approval_groups",
      "purpose_justification_required",
      "purpose_justification_prompt",
      "isolation_required",
    ]) {
      if (current.result[k] !== undefined) keep[k] = current.result[k];
    }
    const body = {
      ...keep,
      name: current.result.name,
      decision: current.result.decision,
      include: activeEmails.map((email) => ({ email: { email } })),
      exclude: current.result.exclude ?? [],
      require: current.result.require ?? [],
      precedence: current.result.precedence,
    };
    const putRes = await fetch(base, { method: "PUT", headers, body: JSON.stringify(body) });
    const put = (await putRes.json()) as { success: boolean; errors?: { message: string }[] };
    if (!putRes.ok || !put.success) {
      return { ok: false, error: put.errors?.[0]?.message ?? `PUT policy ${putRes.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Access API nedostupné" };
  }
}
