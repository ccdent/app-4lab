import type { CSSProperties } from "react";
import type { Density, DensityComponent, DensityRecipe } from "./types";

// ---------------------------------------------------------------------------
// Compact density tokens — single source of truth
// Derived from docs/order-form-style-guide.md
// ---------------------------------------------------------------------------

const COMPACT_INPUT_HEIGHT = "32px";
const COMPACT_INPUT_FONT = "0.875rem"; // 14px
const COMPACT_INPUT_RADIUS = "6px";

const COMPACT_LABEL: CSSProperties = {
  fontSize: "0.8125rem", // 13px
  fontWeight: 500,
  color: "light-dark(#374151, #cfcfcf)",
  marginBottom: "4px",
};

const COMPACT_INPUT: CSSProperties = {
  height: COMPACT_INPUT_HEIGHT,
  minHeight: COMPACT_INPUT_HEIGHT,
  fontSize: COMPACT_INPUT_FONT,
  borderRadius: COMPACT_INPUT_RADIUS,
};

// ---------------------------------------------------------------------------
// Compact recipes per component
// ---------------------------------------------------------------------------

const COMPACT_RECIPES: Record<DensityComponent, DensityRecipe> = {
  TextInput: {
    size: "sm",
    styles: { input: COMPACT_INPUT, label: COMPACT_LABEL },
  },
  Textarea: {
    size: "sm",
    styles: {
      input: { fontSize: COMPACT_INPUT_FONT, borderRadius: COMPACT_INPUT_RADIUS },
      label: COMPACT_LABEL,
    },
  },
  Select: {
    size: "sm",
    styles: { input: COMPACT_INPUT, label: COMPACT_LABEL },
  },
  NumberInput: {
    size: "sm",
    styles: { input: COMPACT_INPUT, label: COMPACT_LABEL },
  },
  DateInput: {
    size: "sm",
    styles: { input: COMPACT_INPUT, label: COMPACT_LABEL },
  },
  Button: {
    size: "sm",
    styles: {
      root: {
        height: COMPACT_INPUT_HEIGHT,
        fontSize: COMPACT_INPUT_FONT,
        fontWeight: 500,
        borderRadius: COMPACT_INPUT_RADIUS,
      },
    },
  },
  ActionIcon: {
    size: "sm",
    styles: {
      root: {
        width: COMPACT_INPUT_HEIGHT,
        height: COMPACT_INPUT_HEIGHT,
        minWidth: COMPACT_INPUT_HEIGHT,
        minHeight: COMPACT_INPUT_HEIGHT,
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a recipe for a component at a given density.
 * Returns `undefined` for "comfortable" or when density is not set —
 * in those cases the global Mantine theme applies its defaults unimpeded.
 */
export function getDensityRecipe(
  component: DensityComponent,
  density: Density | undefined,
): DensityRecipe | undefined {
  if (!density || density === "comfortable") return undefined;
  return COMPACT_RECIPES[component];
}

/**
 * Merges recipe styles with component-level style overrides.
 * Component overrides are spread last per style key, so they win per-property.
 * Returns `undefined` when both inputs are absent (no-op).
 */
export function mergeDensityStyles(
  recipe: DensityRecipe | undefined,
  overrides?: Record<string, CSSProperties>,
): Record<string, CSSProperties> | undefined {
  if (!recipe && !overrides) return undefined;
  if (!recipe) return overrides;
  if (!overrides) return recipe.styles;

  const merged: Record<string, CSSProperties> = { ...recipe.styles };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = { ...merged[key], ...value };
  }
  return merged;
}
