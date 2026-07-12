import type { CSSProperties } from "react";
import type { MantineSize } from "@mantine/core";

/** UI density variants. "comfortable" = global theme defaults (no-op). */
export type Density = "comfortable" | "compact";

/** Mantine components that participate in the density contract. */
export type DensityComponent =
  | "TextInput"
  | "Textarea"
  | "Select"
  | "NumberInput"
  | "DateInput"
  | "Button"
  | "ActionIcon";

/** Recipe output: Mantine size + explicit styles that override theme inline styles. */
export interface DensityRecipe {
  size: MantineSize;
  styles: Record<string, CSSProperties>;
}
