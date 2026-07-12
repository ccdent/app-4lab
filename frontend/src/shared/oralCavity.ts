// ─── Oral Cavity Picker — single source of truth for types & constants ───────

export type ToothState = "EMPTY" | "STUMP" | "MISSING" | "IMPLANT";

/** Povolené stavy zubu — jediný zdroj pravdy pro validaci (normalizace, render). */
const VALID_TOOTH_STATES = new Set<ToothState>(["EMPTY", "STUMP", "MISSING", "IMPLANT"]);

export type ArchSelection = "ARCH_UPPER" | "ARCH_LOWER";

export interface Bridge {
  id: string;
  arch: "UPPER" | "LOWER";
  teeth: number[];
}

export interface OralCavityValue {
  version: 2;
  toothStates: Record<string, ToothState>;
  bridges: Bridge[];
  archSelections: ArchSelection[];
}

// ─── Default value for new orders ────────────────────────────────────────────

export function emptyOralCavityValue(): OralCavityValue {
  return { version: 2, toothStates: {}, bridges: [], archSelections: [] };
}

// ─── Normalize any raw/legacy value into a valid v2 shape ────────────────────

export function normalizeOralCavityValue(raw: unknown): OralCavityValue {
  const obj = (raw != null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Validuj hodnoty toothStates proti povoleným stavům. Neznámé/legacy hodnoty
  // (např. pre-v2 "PONTIC" z dob, kdy picker měl stav mezičlenu) ZAHOĎ — render
  // je pak bere jako EMPTY (fallback). Bez toho `STATE_COLORS[state]` vrátí
  // undefined a `colors.bg` shodí celý detail zakázky.
  const rawStates =
    obj.toothStates != null && typeof obj.toothStates === "object"
      ? (obj.toothStates as Record<string, unknown>)
      : {};
  const toothStates: Record<string, ToothState> = {};
  for (const [tooth, st] of Object.entries(rawStates)) {
    if (typeof st === "string" && VALID_TOOTH_STATES.has(st as ToothState)) {
      toothStates[tooth] = st as ToothState;
    }
  }

  return {
    version: 2,
    toothStates,
    bridges: Array.isArray(obj.bridges) ? obj.bridges : [],
    archSelections: Array.isArray(obj.archSelections) ? obj.archSelections : [],
  };
}

// ─── Tooth sequences (dental FDI order) ──────────────────────────────────────

export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

// ─── Arch-order sort (clinical sequence, not numeric) ────────────────────────

const ARCH_ORDER = new Map<number, number>();
UPPER_TEETH.forEach((t, i) => ARCH_ORDER.set(t, i));
LOWER_TEETH.forEach((t, i) => ARCH_ORDER.set(t, i + UPPER_TEETH.length));

/** Sort teeth in clinical arch order (right→midline→left), not numerically. */
export function sortTeethByArchOrder(teeth: number[]): number[] {
  return [...teeth].sort((a, b) => (ARCH_ORDER.get(a) ?? 999) - (ARCH_ORDER.get(b) ?? 999));
}

// ─── State cycle for picker click-through ────────────────────────────────────

export const STATE_CYCLE: ToothState[] = ["EMPTY", "STUMP", "MISSING", "IMPLANT"];

// ─── Colors per state ────────────────────────────────────────────────────────

export const STATE_COLORS: Record<ToothState, { bg: string; border: string; text: string }> = {
  EMPTY:   { bg: "light-dark(#f9fafb, #191919)", border: "light-dark(#d1d5db, #3f3f3f)", text: "light-dark(#9ca3af, #7a7a7a)" },
  STUMP:   { bg: "#dcfce7", border: "#22c55e", text: "#14532d" },
  MISSING: { bg: "#fef9c3", border: "#eab308", text: "#713f12" },
  IMPLANT: { bg: "#fee2e2", border: "#ef4444", text: "#7f1d1d" },
};

// ─── Czech state names ───────────────────────────────────────────────────────

export const STATE_NAME: Record<ToothState, string> = {
  EMPTY:   "Prázdný",
  STUMP:   "Pahýl",
  MISSING: "Chybějící",
  IMPLANT: "Implantát",
};

// ─── Print label mark symbols ────────────────────────────────────────────────

export const MARK_MAP: Record<string, string> = {
  STUMP:   "\u25CF", // ● pahýl
  MISSING: "\u25CB", // ○ chybějící
  IMPLANT: "\u00D7", // × implantát
};
