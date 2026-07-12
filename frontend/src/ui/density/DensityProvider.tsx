import { type ReactNode } from "react";
import type { Density } from "./types";
import { DensityContext } from "./densityContext";

interface DensityProviderProps {
  density: Density;
  children: ReactNode;
}

/**
 * Provides a density variant to all density-aware descendants.
 * Wrap a page section or form in `<DensityProvider density="compact">`
 * to activate compact sizing for all participating components.
 */
export function DensityProvider({ density, children }: DensityProviderProps) {
  return (
    <DensityContext.Provider value={density}>
      {children}
    </DensityContext.Provider>
  );
}
