import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Box, Group, Text } from "@mantine/core";
import { SHORT_CODE_SLOTS, normalizeShortCode } from "./shortCodeUtils";
import { t } from "../../i18n";

/**
 * Imperative API exponovaná přes `ref` prop.
 * Použito v konzumentech pro refocus po dokončení akce (např. potvrzení LOTu).
 */
export interface ShortCodeSlotInputHandle {
  focus: () => void;
}

/**
 * Sdílený 4-box slot input pro short_code skladové položky.
 *
 * Vizuální konzistence: jediná velikost (48×56 px, monospace 24px, fontWeight 700).
 * Použito v OrderMaterialsSection (orders detail) i RecipeProposalResolveDialog
 * (vyřešení placeholderu / změna LOT).
 *
 * Vnitřní implementace: hidden `<input opacity:0>` overlay přes 4 vizuální boxy.
 * - Auto-uppercase + strip whitespace/dashes přes `normalizeShortCode` (shortCodeUtils.ts).
 * - Auto-submit přes `onComplete` callback ve chvíli, kdy hodnota dosáhne SHORT_CODE_SLOTS.
 * - Žádná business logika uvnitř — komponenta jen emituje events.
 */

interface ShortCodeSlotInputProps {
  value: string;
  onChange: (normalized: string) => void;
  /** Volá se, když uživatel zadal všechny SHORT_CODE_SLOTS znaků. */
  onComplete?: (normalized: string) => void;
  /** Volá se při Enter, pokud je hodnota neprázdná (i nedokončená). */
  onSubmit?: (normalized: string) => void;
  disabled?: boolean;
  /** Pokud true, neaplikuje aktivní slot pulse (RPC hledání běží). */
  looking?: boolean;
  autoFocus?: boolean;
  /** Volitelný element vpravo vedle slotů (např. „Hledám…" status text). */
  rightAddon?: React.ReactNode;
  /** React 19 ref prop — vystavuje imperativní `focus()` API. */
  ref?: Ref<ShortCodeSlotInputHandle>;
}

export default function ShortCodeSlotInput({
  value,
  onChange,
  onComplete,
  onSubmit,
  disabled = false,
  looking = false,
  autoFocus = false,
  rightAddon,
  ref,
}: ShortCodeSlotInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
    }),
    [],
  );

  // Autofocus s krátkým delay — Mantine Modal `trapFocus` (default true) po mountu
  // přebírá focus na první focusable element (typicky close button). Synchronní
  // `inputRef.current.focus()` v useEffect proběhne PŘED Mantine focus trap, takže
  // ho trap přepíše. 50ms timeout zajistí, že náš focus call přijde AŽ PO trap →
  // vrátí fokus na slot input. Použitelné v kterémkoli Mantine Modal kontextu.
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [autoFocus]);

  return (
    <Group gap={16} align="center" wrap="nowrap">
      <Box
        style={{
          position: "relative",
          display: "inline-flex",
          gap: 6,
          cursor: disabled ? "not-allowed" : "text",
          flexShrink: 0,
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            const normalized = normalizeShortCode(e.target.value);
            onChange(normalized);
            if (normalized.length === SHORT_CODE_SLOTS && onComplete) {
              onComplete(normalized);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.length > 0 && onSubmit) {
              e.preventDefault();
              onSubmit(value);
            }
            // Plné pole (např. po „kód nenalezen"): další psaní začne nový
            // kód — jinak maxLength všechno zahodí a jde jen Backspace.
            if (
              value.length === SHORT_CODE_SLOTS &&
              e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              e.preventDefault();
              onChange(normalizeShortCode(e.key));
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          maxLength={SHORT_CODE_SLOTS}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            position: "absolute",
            opacity: 0,
            width: "100%",
            height: "100%",
            top: 0,
            left: 0,
            cursor: disabled ? "not-allowed" : "text",
          }}
          aria-label={t("4-znakový kód materiálu")}
        />
        {Array.from({ length: SHORT_CODE_SLOTS }).map((_, i) => {
          const char = value[i] ?? "";
          const isActive = focused && i === value.length && !looking;
          return (
            <Box
              key={i}
              style={{
                width: 48,
                height: 56,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                border: isActive
                  ? "2px solid #7E9B12"
                  : char
                    ? "2px solid light-dark(#d1d5db, #3f3f3f)"
                    : "2px dashed light-dark(#d1d5db, #3f3f3f)",
                backgroundColor: char ? "light-dark(#f9fafb, #191919)" : "light-dark(#ffffff, #1f1f1f)",
                transition: "border-color 0.15s, background-color 0.15s, box-shadow 0.15s",
                boxShadow: isActive ? "0 0 0 3px rgba(45,158,158,0.15)" : undefined,
              }}
            >
              <Text
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
                  fontSize: 24,
                  fontWeight: 700,
                  color: char ? "light-dark(#111827, #ececec)" : "light-dark(#d1d5db, #3f3f3f)",
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                {char || "—"}
              </Text>
            </Box>
          );
        })}
      </Box>

      {rightAddon}
    </Group>
  );
}
