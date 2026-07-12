// =============================================================================
// Auth middleware — Cloudflare Access (Zero Trust)
// =============================================================================
// Access ověřil uživatele PŘED Workerem a předává podepsaný JWT v hlavičce
// `Cf-Access-Jwt-Assertion`. Middleware:
//   1. kryptograficky ověří JWT proti JWKS týmu (jose, klíče se cachují),
//   2. vytáhne e-mail, dohledá aktivního technika v D1,
//   3. uloží ho do kontextu (c.get("me")) pro handlery.
// Audit pole (created_by…) se berou VŽDY odsud, nikdy z request payloadu.
//
// Lokální vývoj: `DEV_USER_EMAIL` v .dev.vars přeskočí ověření JWT (Access
// lokálně neběží). V produkci se proměnná nesmí nastavit.
// =============================================================================

import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { technician } from "./db/schema";

export interface Env {
  DB: D1Database;
  /** Volitelný — demo má vlastní bucket jen s ukázkovými fotkami (read-only). */
  ATTACHMENTS?: R2Bucket;
  /** "1" = veřejné demo: pevná identita, limity, noční reset (viz demo/). */
  DEMO_MODE?: string;
  DEMO_RESET_KEY?: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_USER_EMAIL?: string;
  // Sync Access policy (viz lib/accessSync.ts); token je worker secret.
  CF_ACCOUNT_ID?: string;
  ACCESS_APP_ID?: string;
  ACCESS_POLICY_ID?: string;
  ACCESS_SYNC_TOKEN?: string;
}

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
  role: "technician" | "lead";
  perms: Perms;
}

export type AppContext = {
  Bindings: Env;
  Variables: { me: Me };
};

// JWKS se cachuje per-isolate (module scope) — jose si hlídá refresh sám.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeamDomain = "";

function getJwks(teamDomain: string) {
  if (!jwks || jwksTeamDomain !== teamDomain) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    );
    jwksTeamDomain = teamDomain;
  }
  return jwks;
}

async function resolveEmail(c: Context<AppContext>): Promise<string | null> {
  // Dev bypass — jen lokální vývoj bez Access.
  if (c.env.DEV_USER_EMAIL) return c.env.DEV_USER_EMAIL;
  // Demo: všichni návštěvníci sdílí jednu identitu (demo DB nic cenného nemá).
  if (c.env.DEMO_MODE === "1") return "demo@4lab.cz";

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token || !c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(c.env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${c.env.ACCESS_TEAM_DOMAIN}`,
      audience: c.env.ACCESS_AUD,
    });
    const email = payload.email;
    return typeof email === "string" ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Vyžaduje ověřenou identitu + existující aktivní účet technika. */
export async function requireTechnician(c: Context<AppContext>, next: Next) {
  const email = await resolveEmail(c);
  if (!email) {
    return c.json(
      { error: { code: "UNAUTHENTICATED", message: "Chybí ověřená identita." } },
      401,
    );
  }

  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(technician)
    .where(eq(technician.email, email))
    .limit(1);
  const tech = rows[0];

  if (!tech || !tech.isActive) {
    return c.json(
      {
        error: {
          code: "NOT_PROVISIONED",
          message: "Účet technika pro tento e-mail neexistuje nebo je deaktivovaný.",
        },
      },
      403,
    );
  }

  const isLead = tech.role === "lead";
  c.set("me", {
    id: tech.id,
    email: tech.email,
    firstName: tech.firstName,
    lastName: tech.lastName,
    role: tech.role,
    // Vedoucí má vždy vše — oprávnění se u něj nefiltrují.
    perms: {
      ordersViewAll: isLead || tech.permOrdersViewAll,
      ordersCreateForOthers: isLead || tech.permOrdersCreateForOthers,
      doctorsEdit: isLead || tech.permDoctorsEdit,
      priceListEdit: isLead || tech.permPriceListEdit,
      materialsEdit: isLead || tech.permMaterialsEdit,
    },
  });
  await next();
}

/** 403 Response, pokud volající není vedoucí (admin sekce). */
export function requireLead(me: Me): { code: string; message: string } | null {
  if (me.role === "lead") return null;
  return { code: "FORBIDDEN", message: "Tuto akci může provést jen vedoucí." };
}

/** 403 payload, pokud chybí konkrétní oprávnění. */
export function requirePerm(me: Me, perm: keyof Perms, label: string): { code: string; message: string } | null {
  if (me.perms[perm]) return null;
  return { code: "FORBIDDEN", message: `Nemáš oprávnění: ${label}. Nastavuje vedoucí v Admin → Technici.` };
}

/**
 * Přístup k zakázce: vedoucí a technik s "vidí vše" mají všechno; jinak jen
 * vlastní zakázky + NEPŘIŘAZENÉ (nové zakázky musí být viditelné, aby si je
 * měl kdo vzít).
 */
export function canAccessOrder(me: Me, assignedTechnicianId: string | null): boolean {
  if (me.role === "lead" || me.perms.ordersViewAll) return true;
  return assignedTechnicianId === null || assignedTechnicianId === me.id;
}
