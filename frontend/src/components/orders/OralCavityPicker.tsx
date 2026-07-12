import { useState } from "react";
import { Box, Group, Text, Tooltip, ActionIcon, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCheck, IconLock, IconPlus } from "@tabler/icons-react";

import {
  type ToothState,
  type Bridge,
  type OralCavityValue,
  type ArchSelection,
  emptyOralCavityValue,
  normalizeOralCavityValue,
  UPPER_TEETH,
  LOWER_TEETH,
  STATE_CYCLE,
  STATE_COLORS,
  STATE_NAME,
} from "../../shared/oralCavity";
import { t } from "../../i18n";

// Re-export types so existing import sites keep working
export type { ToothState, Bridge, OralCavityValue, ArchSelection };

interface OralCavityPickerProps {
  value?: OralCavityValue;
  onChange?: (value: OralCavityValue) => void;
  disabled?: boolean;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const TOOTH_W = 40;
const TOOTH_H = 44;
const TOOTH_GAP = 4;
const BRACKET_H = 26; // height of bracket area above/below the tooth row

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToothState(states: Record<string, ToothState>, tooth: number): ToothState {
  return states[String(tooth)] ?? "EMPTY";
}

/**
 * Build a tooth → bridgeId lookup map.
 * Defensively: if a tooth appears in more than one bridge (data corruption),
 * the first bridge wins and subsequent conflicts are logged + ignored.
 */
function buildMembership(bridges: Bridge[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const bridge of bridges) {
    for (const tooth of bridge.teeth) {
      if (map[tooth] !== undefined) {
        console.warn(
          `[OralCavityPicker] Tooth ${tooth} is in multiple bridges. ` +
          `Keeping bridge "${map[tooth]}", ignoring bridge "${bridge.id}".`
        );
        continue;
      }
      map[tooth] = bridge.id;
    }
  }
  return map;
}

// Returns maximal contiguous blocks of non-empty, non-bridged teeth (length >= 2)
function findCandidateBlocks(
  teeth: number[],
  states: Record<string, ToothState>,
  membership: Record<number, string>
): number[][] {
  const blocks: number[][] = [];
  let current: number[] = [];

  for (const tooth of teeth) {
    const state = getToothState(states, tooth);
    const inBridge = membership[tooth] !== undefined;

    if (state !== "EMPTY" && !inBridge) {
      current.push(tooth);
    } else {
      if (current.length >= 2) blocks.push(current);
      current = [];
    }
  }
  if (current.length >= 2) blocks.push(current);
  return blocks;
}

// ─── Arch component ───────────────────────────────────────────────────────────

interface ArchProps {
  arch: "UPPER" | "LOWER";
  teeth: number[];
  toothStates: Record<string, ToothState>;
  bridges: Bridge[];
  membership: Record<number, string>;
  onToothClick: (tooth: number) => void;
  onAddBridge: (block: number[]) => void;
  onRemoveBridge: (bridgeId: string) => void;
  disabled: boolean;
}

function Arch({
  arch,
  teeth,
  toothStates,
  bridges,
  membership,
  onToothClick,
  onAddBridge,
  onRemoveBridge,
  disabled,
}: ArchProps) {
  const isUpper = arch === "UPPER";
  const candidateBlocks = findCandidateBlocks(teeth, toothStates, membership);
  const archBridges = bridges.filter((b) => b.arch === arch);

  const [hoveredTooth, setHoveredTooth] = useState<number | null>(null);

  const rowWidth = teeth.length * TOOTH_W + (teeth.length - 1) * TOOTH_GAP;

  function toothX(idx: number): number {
    return idx * (TOOTH_W + TOOTH_GAP);
  }

  return (
    <Box
      style={{
        position: "relative",
        width: rowWidth,
        height: TOOTH_H + BRACKET_H,
      }}
    >
      {/* ── Tooth buttons ──────────────────────────────────────────────── */}
      {teeth.map((tooth, idx) => {
        const state = getToothState(toothStates, tooth);
        const inBridge = membership[tooth] !== undefined;
        const colors = STATE_COLORS[state];
        const isHovered = hoveredTooth === tooth && !inBridge && !disabled;

        return (
          <Tooltip
            key={tooth}
            label={
              inBridge
                ? t("{zub} – {stav} (zub je v mostu)", { zub: tooth, stav: t(STATE_NAME[state]) })
                : `${tooth} – ${t(STATE_NAME[state])}`
            }
            withArrow
            position={isUpper ? "bottom" : "top"}
            openDelay={200}
          >
            <Box
              onClick={() => !disabled && !inBridge && onToothClick(tooth)}
              onMouseEnter={() => !disabled && !inBridge && setHoveredTooth(tooth)}
              onMouseLeave={() => setHoveredTooth(null)}
              style={{
                position: "absolute",
                left: toothX(idx),
                top: isUpper ? BRACKET_H : 0,
                width: TOOTH_W,
                height: TOOTH_H,
                borderRadius: 8,
                border: `1.5px solid ${inBridge ? "light-dark(#9ca3af, #7a7a7a)" : colors.border}`,
                backgroundColor: colors.bg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: disabled ? "default" : inBridge ? "not-allowed" : "pointer",
                userSelect: "none",
                transition: "all 0.14s ease",
                opacity: disabled ? 0.6 : 1,
                boxShadow: isHovered ? `0 0 0 2px ${colors.border}22` : undefined,
                transform: isHovered ? "translateY(-1px)" : undefined,
              }}
            >
              <Text
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: inBridge ? "light-dark(#9ca3af, #7a7a7a)" : colors.text,
                  lineHeight: 1,
                }}
              >
                {tooth}
              </Text>
            </Box>
          </Tooltip>
        );
      })}

      {/* ── Bridge overlays ────────────────────────────────────────────── */}
      {archBridges.map((bridge) => {
        const sortedTeeth = [...bridge.teeth].sort(
          (a, b) => teeth.indexOf(a) - teeth.indexOf(b)
        );

        const idxFirst = teeth.indexOf(sortedTeeth[0]);
        const idxLast = teeth.indexOf(sortedTeeth[sortedTeeth.length - 1]);
        if (idxFirst === -1 || idxLast === -1) return null;

        const x1 = toothX(idxFirst);
        const x2 = toothX(idxLast) + TOOTH_W;
        const midX = (x1 + x2) / 2;

        const svgTop = isUpper ? 0 : TOOTH_H;
        const lineY = isUpper ? BRACKET_H - 8 : 8;
        const descY = isUpper ? BRACKET_H : 0;
        const btnTop = isUpper ? 2 : TOOTH_H + 4;

        return (
          <Box key={bridge.id} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <svg
              style={{
                position: "absolute",
                top: svgTop,
                left: 0,
                width: rowWidth,
                height: BRACKET_H,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <line x1={x1 + 3} y1={lineY} x2={x2 - 3} y2={lineY} stroke="light-dark(#6b7280, #9b9b9b)" strokeWidth={2.5} />
              <line x1={x1 + 3} y1={lineY} x2={x1 + 3} y2={descY} stroke="light-dark(#6b7280, #9b9b9b)" strokeWidth={2.5} />
              <line x1={x2 - 3} y1={lineY} x2={x2 - 3} y2={descY} stroke="light-dark(#6b7280, #9b9b9b)" strokeWidth={2.5} />
            </svg>

            <Tooltip label={t("Zrušit most")} withArrow position={isUpper ? "top" : "bottom"}>
              <ActionIcon
                size={22}
                variant="filled"
                color="teal"
                radius="xl"
                style={{
                  position: "absolute",
                  left: midX - 11,
                  top: btnTop,
                  pointerEvents: disabled ? "none" : "auto",
                  cursor: disabled ? "default" : "pointer",
                  zIndex: 10,
                }}
                onClick={() => !disabled && onRemoveBridge(bridge.id)}
              >
                <IconLock size={13} />
              </ActionIcon>
            </Tooltip>
          </Box>
        );
      })}

      {/* ── Candidate blocks: bracket + + button ─────────────────────── */}
      {candidateBlocks.map((block) => {
        const idxFirst = teeth.indexOf(block[0]);
        const idxLast = teeth.indexOf(block[block.length - 1]);
        if (idxFirst === -1 || idxLast === -1) return null;

        const x1 = toothX(idxFirst);
        const x2 = toothX(idxLast) + TOOTH_W;
        const midX = (x1 + x2) / 2;

        const svgTop = isUpper ? 0 : TOOTH_H;
        const lineY = isUpper ? BRACKET_H - 8 : 8;
        const descY = isUpper ? BRACKET_H : 0;
        const btnTop = isUpper ? 2 : TOOTH_H + 4;

        return (
          <Box key={`cand-${block.join("-")}`} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <svg
              style={{
                position: "absolute",
                top: svgTop,
                left: 0,
                width: rowWidth,
                height: BRACKET_H,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <line x1={x1 + 3} y1={lineY} x2={x2 - 3} y2={lineY} stroke="light-dark(#9ca3af, #7a7a7a)" strokeWidth={2.5} strokeDasharray="4 3" />
              <line x1={x1 + 3} y1={lineY} x2={x1 + 3} y2={descY} stroke="light-dark(#9ca3af, #7a7a7a)" strokeWidth={2.5} />
              <line x1={x2 - 3} y1={lineY} x2={x2 - 3} y2={descY} stroke="light-dark(#9ca3af, #7a7a7a)" strokeWidth={2.5} />
            </svg>

            <Tooltip label={t("Vytvořit most")} withArrow position={isUpper ? "top" : "bottom"}>
              <ActionIcon
                size={22}
                variant="filled"
                color="gray"
                radius="xl"
                style={{
                  position: "absolute",
                  left: midX - 11,
                  top: btnTop,
                  pointerEvents: disabled ? "none" : "auto",
                  cursor: disabled ? "default" : "pointer",
                  zIndex: 10,
                }}
                onClick={() => !disabled && onAddBridge(block)}
              >
                <IconPlus size={13} />
              </ActionIcon>
            </Tooltip>
          </Box>
        );
      })}
    </Box>
  );
}


// ─── Mobile arch (quadrant rows) ─────────────────────────────────────────────
// 16 zubů se na ~393px do jedné řady nevejde bez zmenšování (zavrženo). Na
// mobilu proto každý oblouk rozdělíme na jeho dva kvadranty po 8 zubech,
// stackované pod sebou; zuby vyplní šířku přes 8sloupcový grid (žádný
// horizontální scroll, žádný zoom). Detekce můstků/kandidátů zůstává na úrovni
// CELÉHO oblouku (16 zubů v klinickém pořadí), takže přední můstky přes střední
// čáru 11|21 fungují dál; jen se renderují rozdělené do dvou řad.

const M_TOOTH_H = 44;
const M_BAND_H = 24;

interface RowSeg {
  row: 0 | 1;
  localStart: number; // 0-based sloupec v rámci kvadrantové řady (0–7)
  localEnd: number;
  extendsPrev: boolean; // blok má zuby i před touto řadou (pokračuje vlevo)
  extendsNext: boolean; // blok má zuby i za touto řadou (pokračuje vpravo)
}

// Rozloží blok zubů (most nebo kandidát) na segmenty podle kvadrantové řady.
// Blok přes střední čáru (indexy 0–7 vs 8–15) vrátí dva segmenty.
function blockRowSegments(blockTeeth: number[], teeth: number[]): RowSeg[] {
  const idxs = blockTeeth
    .map((t) => teeth.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (idxs.length === 0) return [];
  const min = idxs[0];
  const max = idxs[idxs.length - 1];
  const segs: RowSeg[] = [];
  for (const row of [0, 1] as const) {
    const inRow = idxs.filter((i) => Math.floor(i / 8) === row);
    if (inRow.length === 0) continue;
    segs.push({
      row,
      localStart: Math.min(...inRow) - row * 8,
      localEnd: Math.max(...inRow) - row * 8,
      extendsPrev: min < row * 8,
      extendsNext: max > row * 8 + 7,
    });
  }
  return segs;
}

function ArchMobile({
  arch,
  teeth,
  toothStates,
  bridges,
  membership,
  onToothClick,
  onAddBridge,
  onRemoveBridge,
  disabled,
}: ArchProps) {
  const candidateBlocks = findCandidateBlocks(teeth, toothStates, membership);
  const archBridges = bridges.filter((b) => b.arch === arch);

  // Segmenty rozdělené podle řady (0 = pravý kvadrant 18–11 / 48–41,
  // 1 = levý kvadrant 21–28 / 31–38).
  const bridgeSegs = archBridges.flatMap((b) =>
    blockRowSegments(b.teeth, teeth).map((s) => ({ ...s, kind: "bridge" as const, bridgeId: b.id }))
  );
  const candSegs = candidateBlocks.flatMap((block) =>
    blockRowSegments(block, teeth).map((s) => ({ ...s, kind: "cand" as const, block }))
  );

  const gridCols = "repeat(8, minmax(0, 1fr))";

  return (
    <Stack gap={2}>
      {([0, 1] as const).map((rowIdx) => {
        const localTeeth = teeth.slice(rowIdx * 8, rowIdx * 8 + 8);
        const rowSegs = [
          ...bridgeSegs.filter((s) => s.row === rowIdx),
          ...candSegs.filter((s) => s.row === rowIdx),
        ];

        return (
          <Box key={rowIdx}>
            {/* Řada zubů — 8sloupcový grid, zuby vyplní šířku */}
            <Box style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4 }}>
              {localTeeth.map((tooth) => {
                const state = getToothState(toothStates, tooth);
                const inBridge = membership[tooth] !== undefined;
                const colors = STATE_COLORS[state];
                return (
                  <Box
                    key={tooth}
                    role="button"
                    aria-label={`${tooth} – ${t(STATE_NAME[state])}`}
                    onClick={() => !disabled && !inBridge && onToothClick(tooth)}
                    style={{
                      height: M_TOOTH_H,
                      borderRadius: 8,
                      border: `1.5px solid ${inBridge ? "light-dark(#9ca3af, #7a7a7a)" : colors.border}`,
                      backgroundColor: colors.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: disabled ? "default" : inBridge ? "not-allowed" : "pointer",
                      userSelect: "none",
                      opacity: disabled ? 0.6 : 1,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: inBridge ? "light-dark(#9ca3af, #7a7a7a)" : colors.text,
                        lineHeight: 1,
                      }}
                    >
                      {tooth}
                    </Text>
                  </Box>
                );
              })}
            </Box>

            {/* Pruh můstků + kandidátů pod řadou (zarovnaný na stejné sloupce) */}
            {rowSegs.length > 0 && (
              <Box
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  gap: 4,
                  marginTop: 3,
                }}
              >
                {rowSegs.map((seg, i) => {
                  const isBridge = seg.kind === "bridge";
                  // Tlačítko (zamknout / vytvořit most) jen na PRVNÍM segmentu bloku
                  // (ten, který nepokračuje zleva), aby přes střední čáru bylo jen jedno.
                  const primary = !seg.extendsPrev;
                  return (
                    <Box
                      key={`${seg.kind}-${i}`}
                      style={{
                        gridColumn: `${seg.localStart + 1} / ${seg.localEnd + 2}`,
                        height: M_BAND_H,
                        borderRadius: 6,
                        border: isBridge ? "1.5px solid #A4C81E" : "1.5px dashed light-dark(#9ca3af, #7a7a7a)",
                        background: isBridge ? "rgba(20,184,166,0.09)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                      }}
                    >
                      {seg.extendsPrev && (
                        <Text style={{ fontSize: 12, lineHeight: 1, color: "light-dark(#6b7280, #9b9b9b)" }}>‹</Text>
                      )}
                      {primary && (
                        <ActionIcon
                          size={20}
                          radius="xl"
                          variant="filled"
                          color={isBridge ? "teal" : "gray"}
                          disabled={disabled}
                          aria-label={isBridge ? t("Zrušit most") : t("Vytvořit most")}
                          onClick={() => {
                            if (disabled) return;
                            if (seg.kind === "bridge") onRemoveBridge(seg.bridgeId);
                            else onAddBridge(seg.block);
                          }}
                        >
                          {isBridge ? <IconLock size={12} /> : <IconPlus size={12} />}
                        </ActionIcon>
                      )}
                      {seg.extendsNext && (
                        <Text style={{ fontSize: 12, lineHeight: 1, color: "light-dark(#6b7280, #9b9b9b)" }}>›</Text>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

// ─── Arch UI helpers (handoff: Concept 3 · Underline Bar) ────────────────────

// Vertical space reserved for the underline bar (4px bar + 6px gap to teeth).
// Label/button wrappers use this as padding so they stay aligned with teeth,
// not with the bar.
const ARCH_BAR_RESERVE = 10;

function ArchUnderline({ active }: { active: boolean }) {
  return (
    <Box
      style={{
        height: 4,
        borderRadius: 2,
        background: active ? "#A4C81E" : "transparent",
        transition: "background .18s ease",
      }}
    />
  );
}


/**
 * Inline jaw label placed to the left of the toggle + teeth row. Wrapped in
 * a TOOTH_H-tall flex box so it vertically centers on the teeth regardless of
 * the Arch's bracket-reserve area.
 */
function JawLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box
      style={{
        height: TOOTH_H,
        display: "flex",
        alignItems: "center",
        flex: "none",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#64748b",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </Text>
    </Box>
  );
}

interface ArchToggleButtonProps {
  variant: "upper" | "lower";
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}

/**
 * Full-arch toggle, placed to the LEFT of the tooth row. Corner radius matches
 * the teeth (8px) so the button feels part of the same visual system. Height
 * matches TOOTH_H; the parent Flex's align-items decides vertical placement so
 * the button stays level with the teeth row regardless of the Arch's bracket
 * reserve area.
 */
function ArchToggleButton({ variant, active, disabled, onToggle }: ArchToggleButtonProps) {
  const label = variant === "upper" ? t("Celý horní oblouk") : t("Celý dolní oblouk");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      style={{
        flex: "none",
        width: 132,
        height: TOOTH_H,
        borderRadius: 8,
        border: `1.5px solid ${active ? "#A4C81E" : "#cbd5e1"}`,
        background: active ? "#A4C81E" : "light-dark(#ffffff, #1f1f1f)",
        color: active ? "light-dark(#ffffff, #1f1f1f)" : "#334155",
        font: "inherit",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "0 10px",
        transition: "background .14s ease, border-color .14s ease, color .14s ease",
      }}
    >
      {active && <IconCheck size={14} stroke={2.5} />}
      {label}
    </button>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const states: ToothState[] = ["EMPTY", "STUMP", "MISSING", "IMPLANT"];

  return (
    <Group gap="sm" mt="xs" wrap="wrap">
      {states.map((state) => {
        const label = t(STATE_NAME[state]);
        const c = STATE_COLORS[state];
        return (
          <Group key={state} gap={4} align="center">
            <Box
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                backgroundColor: c.bg,
                border: `1.5px solid ${c.border}`,
                flexShrink: 0,
              }}
            />
            <Text size="xs" c="dimmed">{label}</Text>
          </Group>
        );
      })}
    </Group>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OralCavityPicker({
  value,
  onChange,
  disabled = false,
}: OralCavityPickerProps) {
  const [internalValue, setInternalValue] = useState<OralCavityValue>(emptyOralCavityValue);
  const isMobile = useMediaQuery("(max-width: 47.99em)") ?? false;

  // Normalize incoming value to guarantee v2 shape (handles legacy/partial objects)
  const current = value != null ? normalizeOralCavityValue(value) : internalValue;

  const update = (next: OralCavityValue) => {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  };

  const membership = buildMembership(current.bridges);

  const handleToothClick = (tooth: number) => {
    const state = getToothState(current.toothStates, tooth);
    const idx = STATE_CYCLE.indexOf(state);
    const nextState = STATE_CYCLE[(idx + 1) % STATE_CYCLE.length];

    const newStates = { ...current.toothStates };
    if (nextState === "EMPTY") {
      delete newStates[String(tooth)];
    } else {
      newStates[String(tooth)] = nextState;
    }
    update({ ...current, toothStates: newStates });
  };

  const handleAddBridge = (arch: "UPPER" | "LOWER", block: number[]) => {
    const bridge: Bridge = {
      id: crypto.randomUUID(),
      arch,
      teeth: [...block],
    };
    update({ ...current, bridges: [...current.bridges, bridge] });
  };

  const handleRemoveBridge = (bridgeId: string) => {
    update({ ...current, bridges: current.bridges.filter((b) => b.id !== bridgeId) });
  };

  const handleArchSelectionToggle = (sel: ArchSelection) => {
    const has = current.archSelections.includes(sel);
    const next = has
      ? current.archSelections.filter((s) => s !== sel)
      : [...current.archSelections, sel];
    update({ ...current, archSelections: next });
  };

  const makeArchProps = (arch: "UPPER" | "LOWER", teeth: number[]): ArchProps => ({
    arch,
    teeth,
    toothStates: current.toothStates,
    bridges: current.bridges,
    membership,
    onToothClick: handleToothClick,
    onAddBridge: (block) => handleAddBridge(arch, block),
    onRemoveBridge: handleRemoveBridge,
    disabled,
  });

  // ─── Mobilní layout: kvadranty pod sebou (viz ArchMobile) ──────────────────
  if (isMobile) {
    return (
      <Box>
        <Stack gap="lg">
          {/* Horní čelist */}
          <Box>
            <Group justify="space-between" align="center" mb={8} wrap="nowrap" gap="sm">
              <JawLabel>{t("Horní čelist")}</JawLabel>
              <ArchToggleButton
                variant="upper"
                active={current.archSelections.includes("ARCH_UPPER")}
                disabled={disabled}
                onToggle={() => !disabled && handleArchSelectionToggle("ARCH_UPPER")}
              />
            </Group>
            <ArchMobile {...makeArchProps("UPPER", UPPER_TEETH)} />
          </Box>

          <Box style={{ height: 1, backgroundColor: "light-dark(#e5e7eb, #333333)" }} />

          {/* Dolní čelist */}
          <Box>
            <Group justify="space-between" align="center" mb={8} wrap="nowrap" gap="sm">
              <JawLabel>{t("Dolní čelist")}</JawLabel>
              <ArchToggleButton
                variant="lower"
                active={current.archSelections.includes("ARCH_LOWER")}
                disabled={disabled}
                onToggle={() => !disabled && handleArchSelectionToggle("ARCH_LOWER")}
              />
            </Group>
            <ArchMobile {...makeArchProps("LOWER", LOWER_TEETH)} />
          </Box>
        </Stack>

        <Stack align="center" gap="xs" mt="md">
          <Legend />
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed" ta="center">
              {t("Klepnutím na zub cyklujete stav (Prázdný → Pahýl → Chybějící → Implantát). Blok ≥ 2 ne-prázdných zubů lze označit jako most (tlačítko + pod řadou).")}
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              {t('Tlačítkem „Celý oblouk" označíte celou čelist. Lze kombinovat s jednotlivými zuby (hybridní práce).')}
            </Text>
          </Stack>
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      {/* Mobil: diagram je širší než viewport (16 zubů × 44px + popisky) —
          scrolluje se horizontálně UVNITŘ komponenty, ne celá stránka.
          `width: max-content` + `margin: 0 auto` drží centrování na desktopu
          (flex-center + overflow by ořízl levý okraj bez možnosti doscrollovat). */}
      <Box style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <Box style={{ width: "max-content", margin: "0 auto" }}>
      <Stack gap={0}>
        {/* Upper jaw: [ label | toggle | teeth + bar ] — bar sits under teeth
            when arch active; label/button get matching bottom-padding so they
            remain vertically aligned with the teeth row, not the bar. */}
        <Group align="flex-end" gap={12} wrap="nowrap">
          <Box style={{ paddingBottom: ARCH_BAR_RESERVE }}>
            <JawLabel>{t("Horní čelist")}</JawLabel>
          </Box>
          <Box style={{ paddingBottom: ARCH_BAR_RESERVE }}>
            <ArchToggleButton
              variant="upper"
              active={current.archSelections.includes("ARCH_UPPER")}
              disabled={disabled}
              onToggle={() => !disabled && handleArchSelectionToggle("ARCH_UPPER")}
            />
          </Box>
          <Box>
            <Arch {...makeArchProps("UPPER", UPPER_TEETH)} />
            <Box mt={6}>
              <ArchUnderline active={current.archSelections.includes("ARCH_UPPER")} />
            </Box>
          </Box>
        </Group>

        {/* Subtle midline separator */}
        <Box
          style={{
            height: 1,
            backgroundColor: "light-dark(#e5e7eb, #333333)",
            margin: "18px 0",
          }}
        />

        {/* Lower jaw: [ label | toggle | bar + teeth ] — bar sits above teeth
            when arch active; label/button mirror with top-padding. */}
        <Group align="flex-start" gap={12} wrap="nowrap">
          <Box style={{ paddingTop: ARCH_BAR_RESERVE }}>
            <JawLabel>{t("Dolní čelist")}</JawLabel>
          </Box>
          <Box style={{ paddingTop: ARCH_BAR_RESERVE }}>
            <ArchToggleButton
              variant="lower"
              active={current.archSelections.includes("ARCH_LOWER")}
              disabled={disabled}
              onToggle={() => !disabled && handleArchSelectionToggle("ARCH_LOWER")}
            />
          </Box>
          <Box>
            <Box mb={6}>
              <ArchUnderline active={current.archSelections.includes("ARCH_LOWER")} />
            </Box>
            <Arch {...makeArchProps("LOWER", LOWER_TEETH)} />
          </Box>
        </Group>
      </Stack>
      </Box>
      </Box>

      <Stack align="center" gap="xs" mt="md">
        <Legend />
        <Stack gap={2} align="center">
          <Text size="xs" c="dimmed" ta="center">
            {t("Kliknutím na zub cyklujete stav (Prázdný → Pahýl → Chybějící → Implantát). Blok ≥ 2 ne-prázdných zubů lze označit jako most.")}
          </Text>
          <Text size="xs" c="dimmed" ta="center">
            {t('Tlačítkem „Vybrat celý oblouk" označíte celou čelist. Celý oblouk lze kombinovat s jednotlivými zuby (hybridní práce).')}
          </Text>
        </Stack>
      </Stack>
    </Box>
  );
}
