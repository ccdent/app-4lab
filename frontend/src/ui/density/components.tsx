import { forwardRef, type CSSProperties } from "react";
import {
  TextInput as MantineTextInput,
  Textarea as MantineTextarea,
  NumberInput as MantineNumberInput,
  Button as MantineButton,
  ActionIcon as MantineActionIcon,
  type TextInputProps,
  type TextareaProps,
  type NumberInputProps,
  type ButtonProps,
  type ActionIconProps,
} from "@mantine/core";
import type { Density } from "./types";
import { useDensity } from "./densityContext";
import { getDensityRecipe, mergeDensityStyles } from "./recipes";

// ---------------------------------------------------------------------------
// Shared helper: resolve density from explicit prop or context
// ---------------------------------------------------------------------------

function useResolvedDensity(densityProp: Density | undefined): Density | undefined {
  const ctxDensity = useDensity();
  return densityProp ?? ctxDensity;
}

// ---------------------------------------------------------------------------
// Mantine v8 polymorphic components (Button, ActionIcon) use complex type
// overloads that resist simple composition. For Button/ActionIcon wrappers
// we include native HTML button attributes explicitly alongside Mantine props.
// ---------------------------------------------------------------------------

type HtmlButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

// ---------------------------------------------------------------------------
// DensityTextInput
// ---------------------------------------------------------------------------

export const DensityTextInput = forwardRef<
  HTMLInputElement,
  TextInputProps & { density?: Density }
>(({ density: densityProp, styles, ...props }, ref) => {
  const density = useResolvedDensity(densityProp);
  const recipe = getDensityRecipe("TextInput", density);
  return (
    <MantineTextInput
      ref={ref}
      {...props}
      size={props.size ?? recipe?.size}
      styles={mergeDensityStyles(recipe, styles as Record<string, CSSProperties>)}
    />
  );
});
DensityTextInput.displayName = "DensityTextInput";

// ---------------------------------------------------------------------------
// DensityTextarea
// ---------------------------------------------------------------------------

export const DensityTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaProps & { density?: Density }
>(({ density: densityProp, styles, ...props }, ref) => {
  const density = useResolvedDensity(densityProp);
  const recipe = getDensityRecipe("Textarea", density);
  return (
    <MantineTextarea
      ref={ref}
      {...props}
      size={props.size ?? recipe?.size}
      styles={mergeDensityStyles(recipe, styles as Record<string, CSSProperties>)}
    />
  );
});
DensityTextarea.displayName = "DensityTextarea";

// ---------------------------------------------------------------------------
// DensityNumberInput
// ---------------------------------------------------------------------------

export const DensityNumberInput = forwardRef<
  HTMLInputElement,
  NumberInputProps & { density?: Density }
>(({ density: densityProp, styles, ...props }, ref) => {
  const density = useResolvedDensity(densityProp);
  const recipe = getDensityRecipe("NumberInput", density);
  return (
    <MantineNumberInput
      ref={ref}
      {...props}
      size={props.size ?? recipe?.size}
      styles={mergeDensityStyles(recipe, styles as Record<string, CSSProperties>)}
    />
  );
});
DensityNumberInput.displayName = "DensityNumberInput";

// ---------------------------------------------------------------------------
// DensityButton
// ---------------------------------------------------------------------------

export const DensityButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & HtmlButtonProps & { density?: Density }
>(({ density: densityProp, styles, ...props }, ref) => {
  const density = useResolvedDensity(densityProp);
  const recipe = getDensityRecipe("Button", density);
  return (
    <MantineButton
      ref={ref}
      {...props}
      size={props.size ?? recipe?.size}
      styles={mergeDensityStyles(recipe, styles as Record<string, CSSProperties>)}
    />
  );
});
DensityButton.displayName = "DensityButton";

// ---------------------------------------------------------------------------
// DensityActionIcon
// ---------------------------------------------------------------------------

export const DensityActionIcon = forwardRef<
  HTMLButtonElement,
  ActionIconProps & HtmlButtonProps & { density?: Density }
>(({ density: densityProp, styles, ...props }, ref) => {
  const density = useResolvedDensity(densityProp);
  const recipe = getDensityRecipe("ActionIcon", density);
  return (
    <MantineActionIcon
      ref={ref}
      {...props}
      size={props.size ?? recipe?.size}
      styles={mergeDensityStyles(recipe, styles as Record<string, CSSProperties>)}
    />
  );
});
DensityActionIcon.displayName = "DensityActionIcon";
