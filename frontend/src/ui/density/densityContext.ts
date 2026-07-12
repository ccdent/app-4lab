import { createContext, useContext } from "react";
import type { Density } from "./types";

export const DensityContext = createContext<Density | undefined>(undefined);

/**
 * Returns the current density from context.
 * Returns `undefined` when no DensityProvider is present —
 * meaning "use global theme defaults" (comfortable density).
 */
export function useDensity(): Density | undefined {
  return useContext(DensityContext);
}
