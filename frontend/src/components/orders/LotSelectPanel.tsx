import { useEffect, useState } from "react";
import {
  Stack,
  Group,
  Text,
  TextInput,
  Badge,
  Button,
  Skeleton,
  Radio,
  ScrollArea,
} from "@mantine/core";
import { api } from "../../api/client";
import type { StockLot } from "../../api/types";
import ExpirationDateInput from "../materials/ExpirationDateInput";
import { formatDateDDMMYYYY as formatDate } from "../../shared/dates";
import { t } from "../../i18n";

/**
 * Sdílený panel výběru šarže (LOT) pro daný katalogový materiál (1:1 crm-full).
 *
 * Jedna obrazovka, žádné pod-režimy: dostupné LOTy jako radio karty řazené
 * dle expirace (FEFO, nejbližší nahoře + badge) a „Nová šarže…" jako
 * rovnocenná volba s formulářem LOT + expirace + povinný režim
 * Naskladnit / Jednorázové použití (BEZ defaultu — vědomé rozhodnutí).
 *
 * Panel jen sbírá volbu a volá `onConfirm(choice)` — API větvení (use /
 * create / confirm…) je na volajícím, protože se liší podle kontextu.
 * Scrolluje výhradně seznam existujících šarží.
 */

export type LotChoice =
  | { kind: "existing"; stockItemId: string }
  | { kind: "new"; lotNumber: string; expirationDate: string; mode: "stock" | "one_time" };

const NEW_LOT_VALUE = "__new__";

type NewLotMode = "stock" | "one_time" | null;

interface LotSelectPanelProps {
  /** Materiál, pro který se vybírá šarže. Změna id panel resetuje a refetchne. */
  materialCatalogId: string;
  /** Preferovaný LOT (např. suggested z návrhu) — předvybere se, pokud je dostupný. */
  preferredStockItemId?: string | null;
  submitting: boolean;
  confirmLabel?: string;
  onConfirm: (choice: LotChoice) => void;
  /** Volitelné tlačítko vlevo od potvrzení (např. Zrušit). */
  leftFooter?: React.ReactNode;
}

export default function LotSelectPanel({
  materialCatalogId,
  preferredStockItemId = null,
  submitting,
  confirmLabel,
  onConfirm,
  leftFooter,
}: LotSelectPanelProps) {
  const [lots, setLots] = useState<StockLot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lotChoice, setLotChoice] = useState<string | null>(null); // stockItemId | NEW_LOT_VALUE

  const [newLotNumber, setNewLotNumber] = useState("");
  const [newLotExp, setNewLotExp] = useState<string | null>(null);
  const [newLotMode, setNewLotMode] = useState<NewLotMode>(null);

  /* ── load lots (server vrací FEFO pořadí) ── */
  useEffect(() => {
    let cancelled = false;
    setLotsLoading(true);
    setLoadError(null);
    setLots([]);
    setLotChoice(null);
    setNewLotNumber("");
    setNewLotExp(null);
    setNewLotMode(null);
    void (async () => {
      try {
        const data = await api.get<StockLot[]>(`/material-catalog/${materialCatalogId}/lots`);
        if (cancelled) return;
        setLotsLoading(false);
        const sorted = [...data].sort((a, b) =>
          (a.expirationDate ?? "9999-12-31").localeCompare(b.expirationDate ?? "9999-12-31"),
        );
        setLots(sorted);
        // Předvýběr: preferovaný LOT (je-li dostupný) → jinak FEFO první → jinak Nová šarže
        if (preferredStockItemId && sorted.some((l) => l.stockItemId === preferredStockItemId)) {
          setLotChoice(preferredStockItemId);
        } else {
          setLotChoice(sorted.length > 0 ? sorted[0].stockItemId : NEW_LOT_VALUE);
        }
      } catch (err) {
        if (cancelled) return;
        setLotsLoading(false);
        setLoadError(err instanceof Error ? err.message : t("Neznámá chyba"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialCatalogId, preferredStockItemId]);

  const canConfirm =
    !!lotChoice &&
    (lotChoice !== NEW_LOT_VALUE ||
      (newLotNumber.trim().length > 0 && !!newLotExp && newLotMode !== null));

  function handleConfirm() {
    if (!canConfirm || submitting || !lotChoice) return;
    if (lotChoice !== NEW_LOT_VALUE) {
      onConfirm({ kind: "existing", stockItemId: lotChoice });
    } else {
      onConfirm({
        kind: "new",
        lotNumber: newLotNumber.trim(),
        expirationDate: newLotExp as string,
        mode: newLotMode as "stock" | "one_time",
      });
    }
  }

  /* Jen existující šarže — jediná scrollovaná část panelu (viz listMaxHeight). */
  const lotList = (
    <Stack gap={8}>
      {lots.map((lot, idx) => (
        <Radio.Card
          key={lot.stockItemId}
          value={lot.stockItemId}
          p="sm"
          style={{
            border: `1px solid ${lotChoice === lot.stockItemId ? "#A4C81E" : "light-dark(#e5e7eb, #333333)"}`,
            borderRadius: 8,
          }}
        >
          <Group gap={12} wrap="nowrap">
            <Radio.Indicator />
            <Text size="sm" fw={600} ff="monospace" c="light-dark(#111827, #ececec)" style={{ flexShrink: 0 }}>
              {lot.shortCode}
            </Text>
            <Text size="sm" c="light-dark(#374151, #cfcfcf)">LOT: {lot.lotNumber ?? "—"}</Text>
            <Text size="sm" c="light-dark(#6b7280, #9b9b9b)">EXP: {formatDate(lot.expirationDate)}</Text>
            {idx === 0 && lots.length > 1 && (
              <Badge size="xs" variant="light" color="teal">
                {t("nejbližší expirace")}
              </Badge>
            )}
          </Group>
        </Radio.Card>
      ))}

      {lots.length === 0 && (
        <Text size="xs" c="light-dark(#92400e, #e3a008)">
          {t("Tento materiál nemá na skladě žádnou dostupnou šarži — založte novou.")}
        </Text>
      )}
    </Stack>
  );

  /* Nová šarže — rovnocenná volba; VŽDY viditelná pod scrollem (nikdy uvnitř). */
  const newLotCard = (
    <Radio.Card
      value={NEW_LOT_VALUE}
      p="sm"
      style={{
        border: `1px ${lotChoice === NEW_LOT_VALUE ? "solid #A4C81E" : "dashed light-dark(#9ca3af, #7a7a7a)"}`,
        borderRadius: 8,
        flexShrink: 0,
      }}
    >
      <Group gap={12} wrap="nowrap">
        <Radio.Indicator />
        <Text size="sm" fw={600} c="light-dark(#111827, #ececec)">
          {t("Nová šarže…")}
        </Text>
      </Group>
    </Radio.Card>
  );

  /* Formulář nové šarže — pod kartou „Nová šarže…", mimo scroll. */
  const newLotForm = lotChoice === NEW_LOT_VALUE && !lotsLoading && !loadError && (
    <Stack
      gap="sm"
      style={{
        border: "1px solid light-dark(#e5e7eb, #333333)",
        borderRadius: 8,
        padding: 14,
        backgroundColor: "light-dark(#f9fafb, #191919)",
        flexShrink: 0,
      }}
    >
      <Group gap={12} grow align="flex-start">
        <TextInput
          label={t("Šarže (LOT)")}
          placeholder={t("Např. L2026-0815")}
          required
          value={newLotNumber}
          onChange={(e) => setNewLotNumber(e.target.value)}
          disabled={submitting}
        />
        <ExpirationDateInput
          required
          value={newLotExp}
          onChange={setNewLotExp}
          disabled={submitting}
        />
      </Group>
      <Radio.Group
        label={t("Režim šarže")}
        withAsterisk
        value={newLotMode ?? ""}
        onChange={(v) => setNewLotMode(v === "" ? null : (v as NewLotMode))}
      >
        <Stack gap={6} mt={4}>
          <Radio
            value="stock"
            label={t("Naskladnit — šarže zůstane na skladu pro další zakázky")}
            disabled={submitting}
          />
          <Radio
            value="one_time"
            label={t("Jednorázové použití — šarže se rovnou označí jako spotřebovaná")}
            disabled={submitting}
          />
        </Stack>
      </Radio.Group>
    </Stack>
  );

  /* Strop scrollovaného seznamu šarží — zbytek modalu musí zůstat na obrazovce.
     Rezervy jsou vědomě přibližné (viz crm-full komentář). */
  const LIST_RESERVE_WITH_FORM_PX = 760;
  const LIST_RESERVE_BASE_PX = 510;
  const LIST_FLOOR_WITH_FORM_PX = 160;
  const LIST_FLOOR_BASE_PX = 240;
  const listMaxHeight =
    lotChoice === NEW_LOT_VALUE
      ? `max(calc(100vh - ${LIST_RESERVE_WITH_FORM_PX}px), ${LIST_FLOOR_WITH_FORM_PX}px)`
      : `max(calc(100vh - ${LIST_RESERVE_BASE_PX}px), ${LIST_FLOOR_BASE_PX}px)`;

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600} c="light-dark(#374151, #cfcfcf)">
        {t("Vyberte šarži (LOT)")}
      </Text>

      {lotsLoading ? (
        <Stack gap={8}>
          <Skeleton height={52} radius={8} />
          <Skeleton height={52} radius={8} />
        </Stack>
      ) : loadError ? (
        <Text size="sm" c="red.7">
          {t("Nepodařilo se načíst šarže:")} {loadError}
        </Text>
      ) : (
        <Radio.Group value={lotChoice} onChange={setLotChoice}>
          <Stack gap={8}>
            <ScrollArea.Autosize mah={listMaxHeight} type="auto" offsetScrollbars>
              {lotList}
            </ScrollArea.Autosize>
            {newLotCard}
          </Stack>
        </Radio.Group>
      )}

      {newLotForm}

      <Group justify="flex-end" gap={8}>
        {leftFooter}
        <Button onClick={handleConfirm} loading={submitting} disabled={!canConfirm}>
          {confirmLabel ?? t("Použít na zakázce")}
        </Button>
      </Group>
    </Stack>
  );
}
