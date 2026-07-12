import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconShieldCheck, IconTrash } from "@tabler/icons-react";
import { api, ApiError } from "../../api/client";
import type { MaterialUsageRow, StockItemByCode } from "../../api/types";
import { formatDateDDMMYYYY } from "../../shared/dates";
import { displayShortCode } from "../../shared/materials";
import ShortCodeSlotInput, { type ShortCodeSlotInputHandle } from "../form/ShortCodeSlotInput";
import { SHORT_CODE_SLOTS } from "../form/shortCodeUtils";
import AddMaterialUsageModal from "./AddMaterialUsageModal";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface Props {
  orderId: string;
  isLocked?: boolean;
  /** Bump → refetch (potvrzení návrhu z receptů zapisuje usage). */
  refreshNonce?: number;
}

/**
 * Použité materiály – MDR compliance (1:1 crm-full OrderMaterialsSection).
 * Rychlý zápis přes 4-znakový kód + katalogová cesta; seznam snapshotů.
 * Ruční zápis je záměrně nezávislý na checklistu návrhů (otevřená lajna).
 */
export default function OrderMaterialsSection({ orderId, isLocked = false, refreshNonce = 0 }: Props) {
  const [usages, setUsages] = useState<MaterialUsageRow[] | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupResult, setLookupResult] = useState<StockItemByCode | "not_found" | null>(null);
  /** Kód posledního hledání — hláška „nenalezen" ho ukazuje i po vyprázdnění pole. */
  const [lastTriedCode, setLastTriedCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<MaterialUsageRow | null>(null);
  const codeInputRef = useRef<ShortCodeSlotInputHandle>(null);

  const canWrite = !isLocked;

  const [loadError, setLoadError] = useState(false);
  const fetchUsages = useCallback(async () => {
    try {
      setUsages(await api.get<MaterialUsageRow[]>(`/orders/${orderId}/material-usages`));
      setLoadError(false);
    } catch {
      // NEschovávat za prázdný seznam — prázdný MDR list musí být pravdivý.
      setUsages(null);
      setLoadError(true);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchUsages();
  }, [fetchUsages, refreshNonce]);

  const lookupSeq = useRef(0);
  const handleLookup = async (normalized: string) => {
    if (normalized.length < SHORT_CODE_SLOTS) return;
    const seq = ++lookupSeq.current; // starší odpověď nesmí přepsat novější kód
    setLooking(true);
    setLookupResult(null);
    setLastTriedCode(normalized);
    try {
      const res = await api.get<StockItemByCode>(`/stock-items/by-short-code/${normalized}`);
      if (seq === lookupSeq.current) setLookupResult(res);
    } catch (err) {
      if (seq !== lookupSeq.current) return;
      if (err instanceof ApiError && err.status === 404) setLookupResult("not_found");
      else notifyError(err instanceof Error ? err.message : t("Hledání selhalo"));
    } finally {
      if (seq === lookupSeq.current) {
        setLooking(false);
        // Vzor z plné verze: po vyhodnocení se pole vrátí do prázdného
        // stavu — výsledek/chyba se ukazují vedle, další kód jde psát hned.
        setCode("");
        codeInputRef.current?.focus();
      }
    }
  };

  const confirmUsage = async (stockItemId: string) => {
    setSubmitting(true);
    try {
      const res = await api.post<{ id: string }>(`/orders/${orderId}/material-usages`, { stockItemId });
      notifySuccess(t("Materiál byl evidován."));
      setCode("");
      setLookupResult(null);
      await fetchUsages();
      setHighlightId(res.id);
      setTimeout(() => setHighlightId(null), 1500);
      codeInputRef.current?.focus();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Zápis se nepodařil"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    try {
      await api.delete(`/material-usages/${deleteRow.id}`);
      notifySuccess(t("Materiál byl odebrán ze zakázky."));
      setUsages((prev) => (prev ? prev.filter((u) => u.id !== deleteRow.id) : prev));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se odebrat materiál"));
    } finally {
      setDeleteRow(null);
    }
  };

  const gridTemplate = canWrite
    ? "90px 1fr 1fr 120px 100px 44px"
    : "90px 1fr 1fr 120px 100px";

  return (
    <Card withBorder>
      <Group gap={8} mb="sm">
        <IconShieldCheck size={20} color="#7E9B12" />
        <Title order={4}>{t("Použité materiály – MDR compliance")}</Title>
      </Group>

      {isLocked && (
        <Alert color="gray" variant="light" mb="md">
          {t("Zakázka je zamčená – úpravy materiálů nejsou možné.")}
        </Alert>
      )}

      {canWrite && (
        // Mobil: sloupce pod sebou, jinak karta přetéká viewport.
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={16} mb="md">
          <Box>
            <Text size="sm" fw={500} mb={6} c="light-dark(#374151, #cfcfcf)">
              {t("Zadej 4-znakový kód materiálu")}
            </Text>
            <ShortCodeSlotInput
              ref={codeInputRef}
              value={code}
              onChange={(v) => {
                setCode(v);
                if (v.length < SHORT_CODE_SLOTS) setLookupResult(null);
              }}
              onComplete={(v) => void handleLookup(v)}
              onSubmit={(v) => void handleLookup(v)}
              looking={looking}
              disabled={submitting}
              rightAddon={
                looking ? (
                  <Text size="sm" c="dimmed">{t("Hledám…")}</Text>
                ) : lookupResult === "not_found" ? (
                  <Text size="sm" c="red.6" ff="monospace">{t("Kód {kod} nenalezen", { kod: lastTriedCode })}</Text>
                ) : null
              }
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} mb={6} c="light-dark(#374151, #cfcfcf)">
              {t("Hledání v katalogu / nová šarže")}
            </Text>
            <Button variant="outline" onClick={() => setCatalogModalOpen(true)}>
              {t("Nemám kód – hledat v katalogu")}
            </Button>
          </Box>
        </SimpleGrid>
      )}

      {canWrite && lookupResult && lookupResult !== "not_found" && (
        <Box
          mb="md"
          p="sm"
          style={{ backgroundColor: "light-dark(#f9fafb, #191919)", border: "1px solid light-dark(#e5e7eb, #333333)", borderRadius: 8 }}
        >
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Box>
              <Text size="sm" fw={600}>
                {lookupResult.canonicalName}{" "}
                <Text component="span" c="dimmed" ff="monospace">({lookupResult.materialCode})</Text>
              </Text>
              <Text size="xs" c="dimmed">{t("Výrobce:")} {lookupResult.manufacturerName}</Text>
              <Text size="xs" c="dimmed">
                LOT: {lookupResult.lotNumber} · EXP: {formatDateDDMMYYYY(lookupResult.expirationDate)}
              </Text>
            </Box>
            {lookupResult.isAvailableForUsage ? (
              <Button
                
                loading={submitting}
                onClick={() => void confirmUsage(lookupResult.id)}
              >
                {t("Potvrdit použití")}
              </Button>
            ) : (
              <Text size="sm" c="red.6" fw={600}>{t("Nelze použít")}</Text>
            )}
          </Group>
        </Box>
      )}

      {loadError ? (
        <Alert color="red" variant="light">
          {t("Použité materiály se nepodařilo načíst.")}{" "}
          <Button size="compact-xs" variant="light" color="red" onClick={() => void fetchUsages()}>
            {t("Zkusit znovu")}
          </Button>
        </Alert>
      ) : usages === null ? (
        <Stack gap={8}>
          <Skeleton height={32} radius={6} />
          <Skeleton height={32} radius={6} />
        </Stack>
      ) : usages.length === 0 ? (
        <Text size="sm" c="dimmed">{t("Zatím žádné materiály.")}</Text>
      ) : (
        <>
        <Box visibleFrom="sm" style={{ overflowX: "auto" }}>
          <Box style={{ minWidth: 640 }}>
            <Box
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                gap: 8,
                padding: "6px 8px",
                borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
              }}
            >
              {[t("Kód"), t("Název"), t("Výrobce"), t("Šarže (LOT)"), t("Expirace"), ...(canWrite ? [""] : [])].map(
                (h, i) => (
                  <Text key={i} size="xs" fw={600} c="dimmed" tt="uppercase">{h}</Text>
                ),
              )}
            </Box>
            {usages.map((u) => (
              <Box
                key={u.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridTemplate,
                  gap: 8,
                  padding: "8px",
                  alignItems: "center",
                  borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)",
                  backgroundColor: highlightId === u.id ? "light-dark(#f3f9d0, #2a3012)" : undefined,
                  transition: "background-color 0.5s",
                }}
              >
                <Text size="sm" ff="monospace" fw={600} c="light-dark(#5F7A0A, #D3EC55)">
                  {displayShortCode(u)}
                </Text>
                <Text size="sm">{u.displayName}</Text>
                <Text size="sm" c="dimmed">{u.manufacturerName}</Text>
                <Text size="sm" c="dimmed">{u.lotNumber}</Text>
                <Text size="sm" c="dimmed">{formatDateDDMMYYYY(u.expirationDate)}</Text>
                {canWrite && (
                  <ActionIcon variant="subtle" color="red" onClick={() => setDeleteRow(u)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Mobil: karty místo tabulky (vzor DataTable). */}
        <Stack hiddenFrom="sm" gap={8}>
          {usages.map((u) => (
            <Box
              key={u.id}
              p="sm"
              style={{
                border: "1px solid light-dark(#e5e7eb, #333333)",
                borderRadius: 8,
                backgroundColor: highlightId === u.id ? "light-dark(#f3f9d0, #2a3012)" : undefined,
              }}
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Box style={{ minWidth: 0 }}>
                  <Group gap={8} wrap="nowrap">
                    <Text size="sm" ff="monospace" fw={700} c="light-dark(#5F7A0A, #D3EC55)">
                      {displayShortCode(u)}
                    </Text>
                    <Text size="sm" fw={600} truncate>
                      {u.displayName}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">{u.manufacturerName}</Text>
                  <Text size="xs" c="dimmed">
                    LOT: {u.lotNumber} · EXP: {formatDateDDMMYYYY(u.expirationDate)}
                  </Text>
                </Box>
                {canWrite && (
                  <ActionIcon variant="subtle" color="red" onClick={() => setDeleteRow(u)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Box>
          ))}
        </Stack>
        </>
      )}

      <AddMaterialUsageModal
        opened={catalogModalOpen}
        orderId={orderId}
        onClose={() => setCatalogModalOpen(false)}
        onAdded={() => {
          setCatalogModalOpen(false);
          void fetchUsages();
        }}
      />

      <Modal opened={!!deleteRow} onClose={() => setDeleteRow(null)} title={t("Odebrat materiál")} size="sm" centered>
        {deleteRow && (
          <Stack gap="md">
            <Text size="sm">{t("Opravdu chcete odebrat tento materiál ze zakázky?")}</Text>
            <Text size="sm" fw={600}>
              {displayShortCode(deleteRow)} – {deleteRow.displayName}
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={() => setDeleteRow(null)}>{t("Zrušit")}</Button>
              <Button color="red" onClick={() => void handleDelete()}>{t("Odebrat")}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Card>
  );
}
