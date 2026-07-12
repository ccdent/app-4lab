import { useEffect, useRef, useState } from "react";
import { Box, Group, Text, Tooltip, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconLock } from "@tabler/icons-react";

import {
  type OralCavityValue,
  type ToothState,
  type Bridge,
  normalizeOralCavityValue,
  UPPER_TEETH,
  LOWER_TEETH,
  STATE_COLORS,
  STATE_NAME,
} from "../../shared/oralCavity";
import { t } from "../../i18n";

// ─── Layout constants — keep in sync with OralCavityPicker ────────────────────
const TOOTH_W = 40;
const TOOTH_H = 44;
const TOOTH_GAP = 4;
const BRACKET_H = 26;
const ARCH_BAR_RESERVE = 10;

interface OralCavityViewerProps {
  value?: OralCavityValue;
  /**
   * Optional hover state — when matches a bridge_id / tooth / arch / "item",
   * the viewer applies a subtle highlight. Used for bidirectional hover with
   * the items list.
   */
  hover?: HoverContext | null;
  /** Called when the user moves cursor over a tooth / bridge / arch label. */
  onHover?: (ctx: HoverContext | null) => void;
}

export type HoverContext =
  | { kind: "item"; itemId: string }
  | { kind: "bridge"; bridgeId: string }
  | { kind: "tooth"; tooth: number }
  | { kind: "arch"; arch: "UPPER" | "LOWER" };

/**
 * Read-only vizualizace oral cavity stavu (pro detail page / audit).
 * Žádné click handlery na zubech, žádné cyklování stavu, žádné toggle full-arch.
 * Pouze zobrazuje to, co je v picker_state, plus volitelný hover highlight
 * pro bidirectional propojení s items list.
 */
export default function OralCavityViewer({
  value,
  hover,
  onHover,
}: OralCavityViewerProps) {
  const v = normalizeOralCavityValue(value);
  const isMobile = useMediaQuery("(max-width: 47.99em)") ?? false;

  const archWidth = UPPER_TEETH.length * TOOTH_W + (UPPER_TEETH.length - 1) * TOOTH_GAP;
  // Natural intrinsic width: arch grid + gap + jaw-label cell.
  const NATURAL_WIDTH = archWidth + 12 + 132;

  // Auto-scale: pokud je dostupná šířka kontejneru menší než natural,
  // diagram se proporcionálně zmenší přes CSS `zoom` (na rozdíl od transform
  // se s ním přepočítá layout box, takže nepřetéká karta a hover události
  // fungují normálně).
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const cw = el.clientWidth;
      if (cw <= 0) return;
      const next = Math.min(1, cw / NATURAL_WIDTH);
      setZoom(Math.max(0.4, next)); // floor pro extrémně úzké stavy
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [NATURAL_WIDTH]);

  function isToothHighlighted(tooth: number, _bridgeIdOfTooth: string | null): boolean {
    if (!hover) return false;
    // Striktní per-context match:
    //   • tooth context  → konkrétní zub
    //   • bridge context → individuální zuby NE-highlightujeme (pouze vnější
    //                      rámeček v isBridgeHighlighted), aby zvýraznění
    //                      působilo jako jedna entita, ne stack tří efektů.
    //   • arch context   → highlight řeší JawLabel pill, ne zuby.
    if (hover.kind === "tooth") return hover.tooth === tooth;
    return false;
  }

  function isArchHighlighted(arch: "UPPER" | "LOWER"): boolean {
    if (!hover) return false;
    return hover.kind === "arch" && hover.arch === arch;
  }

  function isBridgeHighlighted(bridgeId: string): boolean {
    if (!hover) return false;
    return hover.kind === "bridge" && hover.bridgeId === bridgeId;
  }

  // ─── Mobilní read-only layout: kvadranty pod sebou (sjednoceno s pickerem) ──
  // Místo drobného zoom-to-fit diagramu (na 393px ~0,46×, nečitelné) používáme
  // stejný kvadrantový layout jako interaktivní OralCavityPicker. Read-only:
  // žádný hover/highlight (na dotyku irelevantní), žádná tlačítka.
  if (isMobile) {
    return (
      <Box>
        <Stack gap="lg">
          <MobileArchBlock
            title={t("Horní čelist")}
            teeth={UPPER_TEETH}
            value={v}
            archActive={v.archSelections.includes("ARCH_UPPER")}
          />
          <Box style={{ height: 1, backgroundColor: "light-dark(#e5e7eb, #333333)" }} />
          <MobileArchBlock
            title={t("Dolní čelist")}
            teeth={LOWER_TEETH}
            value={v}
            archActive={v.archSelections.includes("ARCH_LOWER")}
          />
        </Stack>
        <Stack align="center" gap="xs" mt="md">
          <Legend />
        </Stack>
      </Box>
    );
  }

  return (
    <Box ref={containerRef}>
      <Box
        style={{
          display: "flex",
          justifyContent: "center",
          // CSS zoom ovlivňuje layout box (nejen vizuální transform), takže
          // diagram se reálně zmenší na šířku karty bez přetečení.
          zoom,
        }}
      >
        <Stack gap={0}>
          {/* Upper jaw row — slate-50/4% fill přes celý pruh při arch hover */}
          <Group
            align="flex-end"
            gap={12}
            wrap="nowrap"
            style={{
              backgroundColor: isArchHighlighted("UPPER") ? "rgba(15,23,42,0.04)" : "transparent",
              borderRadius: 6,
              padding: "4px 0",
              transition: "background-color 0.14s ease",
            }}
          >
            <Box style={{ paddingBottom: ARCH_BAR_RESERVE }}>
              <JawLabel
                title={t("Horní čelist")}
                arch="UPPER"
                active={v.archSelections.includes("ARCH_UPPER")}
                highlighted={isArchHighlighted("UPPER")}
                // Hover na arch label zapneme jen když je arch aktivní —
                // jinak by se vyvolal hover bez vazby na data.
                onMouseEnter={
                  v.archSelections.includes("ARCH_UPPER")
                    ? () => onHover?.({ kind: "arch", arch: "UPPER" })
                    : undefined
                }
                onMouseLeave={
                  v.archSelections.includes("ARCH_UPPER")
                    ? () => onHover?.(null)
                    : undefined
                }
              />
            </Box>
            <Box>
              <ArchView
                arch="UPPER"
                teeth={UPPER_TEETH}
                value={v}
                isToothHighlighted={isToothHighlighted}
                isBridgeHighlighted={isBridgeHighlighted}
                onHover={onHover}
              />
              <Box mt={6}>
                <ArchUnderline active={v.archSelections.includes("ARCH_UPPER")} />
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

          {/* Lower jaw row — slate-50/4% fill přes celý pruh při arch hover */}
          <Group
            align="flex-start"
            gap={12}
            wrap="nowrap"
            style={{
              backgroundColor: isArchHighlighted("LOWER") ? "rgba(15,23,42,0.04)" : "transparent",
              borderRadius: 6,
              padding: "4px 0",
              transition: "background-color 0.14s ease",
            }}
          >
            <Box style={{ paddingTop: ARCH_BAR_RESERVE }}>
              <JawLabel
                title={t("Dolní čelist")}
                arch="LOWER"
                active={v.archSelections.includes("ARCH_LOWER")}
                highlighted={isArchHighlighted("LOWER")}
                onMouseEnter={
                  v.archSelections.includes("ARCH_LOWER")
                    ? () => onHover?.({ kind: "arch", arch: "LOWER" })
                    : undefined
                }
                onMouseLeave={
                  v.archSelections.includes("ARCH_LOWER")
                    ? () => onHover?.(null)
                    : undefined
                }
              />
            </Box>
            <Box>
              <Box mb={6}>
                <ArchUnderline active={v.archSelections.includes("ARCH_LOWER")} />
              </Box>
              <ArchView
                arch="LOWER"
                teeth={LOWER_TEETH}
                value={v}
                isToothHighlighted={isToothHighlighted}
                isBridgeHighlighted={isBridgeHighlighted}
                onHover={onHover}
              />
            </Box>
          </Group>
        </Stack>
      </Box>

      <Stack align="center" gap="xs" mt="md">
        <Legend />
      </Stack>
    </Box>
  );
}

// ─── JawLabel ────────────────────────────────────────────────────────────────

function JawLabel({
  title,
  arch,
  active,
  highlighted,
  onMouseEnter,
  onMouseLeave,
}: {
  title: string;
  arch: "UPPER" | "LOWER";
  active: boolean;
  highlighted: boolean;
  /** Hover handlery jsou volitelné — neaktivní arch nemá data k highlight, takže label neposílá hover signál. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const isUpper = arch === "UPPER";
  const PILL_H = 34;
  const LABEL_GAP = 6;
  // Label je ukotvený na hraně pillu (ne cell). Pill je vycentrovaný v cell
  // (TOOTH_H = 44, PILL_H = 34 → 5px nahoře a dole), takže edge pillu je
  // (TOOTH_H + PILL_H) / 2 od opačné strany cell. Plus LABEL_GAP.
  const LABEL_OFFSET = (TOOTH_H + PILL_H) / 2 + LABEL_GAP;

  const labelStyle = {
    fontSize: 11,
    fontWeight: highlighted ? 600 : 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: highlighted ? "light-dark(#111827, #ececec)" : "light-dark(#4b5563, #b5b5b5)",
    whiteSpace: "nowrap" as const,
    lineHeight: 1,
    transition: "color 0.15s ease, font-weight 0.15s ease",
  };
  const pillStyle = {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    height: PILL_H,
    padding: "0 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
    backgroundColor: active ? "var(--mantine-color-teal-6)" : "transparent",
    color: active ? "light-dark(#ffffff, #1f1f1f)" : "light-dark(#374151, #cfcfcf)",
    border: active ? "none" : "1px solid light-dark(#d1d5db, #3f3f3f)",
    transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
  };

  // Symetrický layout pro obě čelisti:
  //   • Pill v normal flow → cell má intrinsic šířku, oba sloupce zarovnány.
  //   • Cell jako flex-column s justify-center → pill vycentrovaný na střed
  //     řádku zubů (cell vertical span = teeth row vertical span).
  //   • Label absolutně mimo cell, ukotvený k hraně pillu:
  //       UPPER → `bottom: LABEL_OFFSET`
  //       LOWER → `top: LABEL_OFFSET`
  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "relative",
        height: TOOTH_H,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        cursor: "default",
      }}
    >
      <Text
        style={{
          ...labelStyle,
          position: "absolute",
          left: 0,
          ...(isUpper ? { bottom: LABEL_OFFSET } : { top: LABEL_OFFSET }),
        }}
      >
        {title}
      </Text>
      <Box style={pillStyle}>{t("Celý oblouk")}</Box>
    </Box>
  );
}

// ─── ArchUnderline ───────────────────────────────────────────────────────────

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

// ─── ArchView (read-only teeth + bridge overlays) ────────────────────────────

interface ArchViewProps {
  arch: "UPPER" | "LOWER";
  teeth: number[];
  value: OralCavityValue;
  isToothHighlighted: (tooth: number, bridgeIdOfTooth: string | null) => boolean;
  isBridgeHighlighted: (bridgeId: string) => boolean;
  onHover?: (ctx: HoverContext | null) => void;
}

function ArchView({
  arch,
  teeth,
  value,
  isToothHighlighted,
  isBridgeHighlighted,
  onHover,
}: ArchViewProps) {
  const isUpper = arch === "UPPER";
  const archBridges = value.bridges.filter((b) => b.arch === arch);

  // tooth → bridge_id lookup (defensive: first wins on conflict)
  const membership: Record<number, string> = {};
  for (const bridge of archBridges) {
    for (const tooth of bridge.teeth) {
      if (membership[tooth] === undefined) {
        membership[tooth] = bridge.id;
      }
    }
  }

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
      {/* Bridge overlays (drawn behind teeth) */}
      {archBridges.map((bridge) => {
        const sortedTeeth = [...bridge.teeth].sort(
          (a, b) => teeth.indexOf(a) - teeth.indexOf(b),
        );
        const idxFirst = teeth.indexOf(sortedTeeth[0]);
        const idxLast = teeth.indexOf(sortedTeeth[sortedTeeth.length - 1]);
        if (idxFirst === -1 || idxLast === -1) return null;
        const x1 = toothX(idxFirst);
        const x2 = toothX(idxLast) + TOOTH_W;
        const svgTop = isUpper ? 0 : TOOTH_H;
        const lineY = isUpper ? BRACKET_H - 8 : 8;
        const descY = isUpper ? BRACKET_H : 0;

        const highlighted = isBridgeHighlighted(bridge.id);
        // Bracket symbol se při hoveru NEMĚNÍ — zvýraznění je pouze vnější
        // rámeček kolem všech zubů můstku. Bracket zůstává neutrální gray.
        const stroke = "light-dark(#6b7280, #9b9b9b)";
        const sw = 2.5;

        return (
          <Box
            key={bridge.id}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <svg
              style={{
                position: "absolute",
                top: svgTop,
                left: 0,
                width: rowWidth,
                height: BRACKET_H,
                overflow: "visible",
              }}
            >
              <line x1={x1 + 3} y1={lineY} x2={x2 - 3} y2={lineY} stroke={stroke} strokeWidth={sw} />
              <line x1={x1 + 3} y1={lineY} x2={x1 + 3} y2={descY} stroke={stroke} strokeWidth={sw} />
              <line x1={x2 - 3} y1={lineY} x2={x2 - 3} y2={descY} stroke={stroke} strokeWidth={sw} />
            </svg>
            {highlighted && (
              <Box
                style={{
                  position: "absolute",
                  left: x1,
                  top: isUpper ? BRACKET_H : 0,
                  width: x2 - x1,
                  height: TOOTH_H,
                  borderRadius: 8,
                  // boxShadow místo border — renderuje se krispěji a nezasahuje
                  // do box-modelu, takže layout se nehne.
                  boxShadow: "0 0 0 1.5px #0f172a",
                  pointerEvents: "none",
                  zIndex: 3,
                }}
              />
            )}
          </Box>
        );
      })}

      {/* Teeth */}
      {teeth.map((tooth, idx) => {
        const state: ToothState = value.toothStates[String(tooth)] ?? "EMPTY";
        const inBridgeId = membership[tooth] ?? null;
        const colors = STATE_COLORS[state];
        const highlighted = isToothHighlighted(tooth, inBridgeId);
        // Hover povolíme jen pro zuby s vazbou na data:
        //   • zub uvnitř můstku (kontext bridge),
        //   • zub s ne-EMPTY stavem (pahýl/chybějící/implantát → kontext tooth).
        // Prázdný zub mimo můstek nemá v zakázce co highlightovat.
        const isHoverActive = inBridgeId != null || state !== "EMPTY";

        return (
          <Tooltip
            key={tooth}
            label={`${tooth} – ${t(STATE_NAME[state])}${inBridgeId ? ` ${t("(v můstku)")}` : ""}`}
            withArrow
            position={isUpper ? "bottom" : "top"}
            openDelay={300}
          >
            <Box
              onMouseEnter={
                isHoverActive
                  ? () => {
                      if (inBridgeId) {
                        onHover?.({ kind: "bridge", bridgeId: inBridgeId });
                      } else {
                        onHover?.({ kind: "tooth", tooth });
                      }
                    }
                  : undefined
              }
              onMouseLeave={isHoverActive ? () => onHover?.(null) : undefined}
              style={{
                position: "absolute",
                left: toothX(idx),
                top: isUpper ? BRACKET_H : 0,
                width: TOOTH_W,
                height: TOOTH_H,
                borderRadius: 8,
                // Highlight stejný jako u bridge overlay: 1.5px slate-900 outline
                // přes boxShadow (bez scale, bez halo) — vizuálně konzistentní.
                border: `1.5px solid ${inBridgeId ? "light-dark(#9ca3af, #7a7a7a)" : colors.border}`,
                backgroundColor: colors.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "default",
                userSelect: "none",
                transition: "box-shadow 0.14s ease",
                boxShadow: highlighted ? "0 0 0 1.5px #0f172a" : undefined,
                zIndex: highlighted ? 2 : undefined,
              }}
            >
              <Text
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: inBridgeId ? "light-dark(#9ca3af, #7a7a7a)" : colors.text,
                  lineHeight: 1,
                }}
              >
                {tooth}
              </Text>
            </Box>
          </Tooltip>
        );
      })}

      {/* Bridge id overlays — invisible hit-area for hover (covers full bridge span,
          so hovering anywhere on the bracket triggers bridge highlight). */}
      {archBridges.map((bridge) => {
        const sortedTeeth = [...bridge.teeth].sort(
          (a, b) => teeth.indexOf(a) - teeth.indexOf(b),
        );
        const idxFirst = teeth.indexOf(sortedTeeth[0]);
        const idxLast = teeth.indexOf(sortedTeeth[sortedTeeth.length - 1]);
        if (idxFirst === -1 || idxLast === -1) return null;
        const x1 = toothX(idxFirst);
        const x2 = toothX(idxLast) + TOOTH_W;

        return (
          <Box
            key={`hit-${bridge.id}`}
            onMouseEnter={() => onHover?.({ kind: "bridge", bridgeId: bridge.id })}
            onMouseLeave={() => onHover?.(null)}
            style={{
              position: "absolute",
              left: x1,
              top: isUpper ? 0 : TOOTH_H,
              width: x2 - x1,
              height: BRACKET_H,
              cursor: "default",
              zIndex: 5,
            }}
          />
        );
      })}
    </Box>
  );
}

// ─── Mobile read-only arch (quadrant rows) ───────────────────────────────────
// Sjednoceno s OralCavityPicker.ArchMobile, ale read-only (bez tlačítek/hoveru).
// Detekce můstků na úrovni celého oblouku → přední můstky přes střední čáru
// 11|21 se renderují rozdělené do dvou řad s chevrony „‹ ›".

interface ViewerRowSeg {
  row: 0 | 1;
  localStart: number;
  localEnd: number;
  extendsPrev: boolean;
  extendsNext: boolean;
  primary: boolean;
}

function bridgeRowSegments(bridgeTeeth: number[], teeth: number[]): ViewerRowSeg[] {
  const idxs = bridgeTeeth
    .map((t) => teeth.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (idxs.length === 0) return [];
  const min = idxs[0];
  const max = idxs[idxs.length - 1];
  const segs: ViewerRowSeg[] = [];
  for (const row of [0, 1] as const) {
    const inRow = idxs.filter((i) => Math.floor(i / 8) === row);
    if (inRow.length === 0) continue;
    const extendsPrev = min < row * 8;
    segs.push({
      row,
      localStart: Math.min(...inRow) - row * 8,
      localEnd: Math.max(...inRow) - row * 8,
      extendsPrev,
      extendsNext: max > row * 8 + 7,
      primary: !extendsPrev,
    });
  }
  return segs;
}

function MobileArchBlock({
  title,
  teeth,
  value,
  archActive,
}: {
  title: string;
  teeth: number[];
  value: OralCavityValue;
  archActive: boolean;
}) {
  const arch = teeth === UPPER_TEETH ? "UPPER" : "LOWER";
  const archBridges = value.bridges.filter((b) => b.arch === arch);
  const membership: Record<number, string> = {};
  for (const bridge of archBridges) {
    for (const tooth of bridge.teeth) {
      if (membership[tooth] === undefined) membership[tooth] = bridge.id;
    }
  }
  const bridgeSegs = archBridges.flatMap((b) =>
    bridgeRowSegments(b.teeth, teeth).map((s) => ({ ...s, bridgeId: b.id }))
  );
  const gridCols = "repeat(8, minmax(0, 1fr))";

  return (
    <Box>
      <Group justify="space-between" align="center" mb={8} wrap="nowrap" gap="sm">
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
          {title}
        </Text>
        {archActive && (
          <Box
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 28,
              padding: "0 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: "var(--mantine-color-teal-6)",
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {t("Celý oblouk")}
          </Box>
        )}
      </Group>

      <Stack gap={2}>
        {([0, 1] as const).map((rowIdx) => {
          const localTeeth = teeth.slice(rowIdx * 8, rowIdx * 8 + 8);
          const rowSegs = bridgeSegs.filter((s) => s.row === rowIdx);
          return (
            <Box key={rowIdx}>
              <Box style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4 }}>
                {localTeeth.map((tooth) => {
                  const state: ToothState = value.toothStates[String(tooth)] ?? "EMPTY";
                  const inBridge = membership[tooth] !== undefined;
                  const colors = STATE_COLORS[state];
                  return (
                    <Box
                      key={tooth}
                      style={{
                        height: 44,
                        borderRadius: 8,
                        border: `1.5px solid ${inBridge ? "light-dark(#9ca3af, #7a7a7a)" : colors.border}`,
                        backgroundColor: colors.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        userSelect: "none",
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

              {rowSegs.length > 0 && (
                <Box
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    gap: 4,
                    marginTop: 3,
                  }}
                >
                  {rowSegs.map((seg, i) => (
                    <Box
                      key={i}
                      style={{
                        gridColumn: `${seg.localStart + 1} / ${seg.localEnd + 2}`,
                        height: 22,
                        borderRadius: 6,
                        border: "1.5px solid #A4C81E",
                        background: "rgba(20,184,166,0.09)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                      }}
                    >
                      {seg.extendsPrev && (
                        <Text style={{ fontSize: 12, lineHeight: 1, color: "light-dark(#6b7280, #9b9b9b)" }}>‹</Text>
                      )}
                      {seg.primary && <IconLock size={12} color="#0d9488" />}
                      {seg.extendsNext && (
                        <Text style={{ fontSize: 12, lineHeight: 1, color: "light-dark(#6b7280, #9b9b9b)" }}>›</Text>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  const states: ToothState[] = ["EMPTY", "STUMP", "MISSING", "IMPLANT"];
  return (
    <Group gap="sm" wrap="wrap">
      {states.map((state) => {
        const label = t(STATE_NAME[state]);
        const colors = STATE_COLORS[state];
        return (
          <Group key={state} gap={4} align="center">
            <Box
              style={{
                width: 16,
                height: 16,
                backgroundColor: colors.bg,
                border: `1.5px solid ${colors.border}`,
                borderRadius: 3,
              }}
            />
            <Text size="xs" c="dimmed">{label}</Text>
          </Group>
        );
      })}
      {/* Můstek — bracket vidlička (stejný tvar jako overlay v ArchView). */}
      <Group gap={4} align="center">
        <svg width={20} height={12} viewBox="0 0 20 12" aria-hidden="true">
          <line x1={2} y1={2} x2={18} y2={2} stroke="light-dark(#6b7280, #9b9b9b)" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={2} y1={2} x2={2} y2={10} stroke="light-dark(#6b7280, #9b9b9b)" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={18} y1={2} x2={18} y2={10} stroke="light-dark(#6b7280, #9b9b9b)" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
        <Text size="xs" c="dimmed">{t("Můstek")}</Text>
      </Group>
    </Group>
  );
}

// Type re-export for callers
export type { Bridge };
