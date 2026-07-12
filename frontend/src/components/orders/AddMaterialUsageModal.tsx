import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { api } from "../../api/client";
import type { MaterialCatalogRow } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import LotSelectPanel, { type LotChoice } from "./LotSelectPanel";
import CreatedStockItemSummary from "../materials/CreatedStockItemSummary";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface Props {
  opened: boolean;
  orderId: string;
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Ruční přidání materiálu bez znalosti kódu: výběr z katalogu → LotSelectPanel
 * (existující šarže / nová šarže Naskladnit / Jednorázově). 1:1 crm-full.
 */
export default function AddMaterialUsageModal({ opened, orderId, onClose, onAdded }: Props) {
  const [catalog, setCatalog] = useState<MaterialCatalogRow[]>([]);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdStock, setCreatedStock] = useState<{
    shortCode: string;
    lotNumber: string;
    expirationDate: string;
    manufacturerName: string;
    canonicalName: string;
  } | null>(null);
  // Remount LotSelectPanel po částečném selhání (šarže vznikla, zápis ne) —
  // nová šarže se pak nabídne jako existující místo druhého vytvoření.
  const [panelNonce, setPanelNonce] = useState(0);

  useEffect(() => {
    if (!opened) {
      setMaterialId(null);
      setCreatedStock(null);
      return;
    }
    void api
      .get<MaterialCatalogRow[]>("/material-catalog")
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, [opened]);

  const material = useMemo(() => catalog.find((c) => c.id === materialId), [catalog, materialId]);

  const handleConfirm = async (choice: LotChoice) => {
    setSubmitting(true);
    try {
      if (choice.kind === "existing") {
        await api.post(`/orders/${orderId}/material-usages`, { stockItemId: choice.stockItemId });
        notifySuccess(t("Materiál byl evidován."));
        onAdded();
      } else if (choice.mode === "one_time") {
        await api.post(`/orders/${orderId}/material-usages/one-time`, {
          materialCatalogId: materialId,
          lotNumber: choice.lotNumber,
          expirationDate: choice.expirationDate,
        });
        notifySuccess(t("Materiál byl evidován (jednorázová šarže)."));
        onAdded();
      } else {
        // Naskladnit + rovnou použít. Materiál zachytit TEĎ — select se může
        // mezitím přepnout a summary by ukázalo cizí název.
        const mat = material;
        const created = await api.post<{ id: string; shortCode: string }>("/stock-items", {
          materialCatalogId: materialId,
          lotNumber: choice.lotNumber,
          expirationDate: choice.expirationDate,
        });
        try {
          await api.post(`/orders/${orderId}/material-usages`, { stockItemId: created.id });
        } catch (err) {
          notifyError(
            t("Šarže {kod} byla naskladněna, ale zápis na zakázku selhal: {chyba}. Šarže je teď v nabídce existujících.", {
              kod: created.shortCode,
              chyba: err instanceof Error ? err.message : "",
            }),
          );
          setPanelNonce((n) => n + 1); // refetch — šarže se objeví v seznamu
          return;
        }
        notifySuccess(t("Šarže byla naskladněna a materiál evidován."));
        setCreatedStock({
          shortCode: created.shortCode,
          lotNumber: choice.lotNumber,
          expirationDate: choice.expirationDate,
          manufacturerName: mat?.manufacturerName ?? "",
          canonicalName: mat?.canonicalName ?? "",
        });
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Zápis se nepodařil"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (submitting) return; // zápis běží — nezavírat
        if (createdStock) onAdded(); // usage už je zapsaná → refetch u rodiče
        else onClose();
      }}
      title={t("Přidat materiál z katalogu")}
      size={640}
      centered
    >
      {createdStock ? (
        <Stack gap="md">
          <CreatedStockItemSummary
            shortCode={createdStock.shortCode}
            manufacturerName={createdStock.manufacturerName}
            canonicalName={createdStock.canonicalName}
            lotNumber={createdStock.lotNumber}
            expirationDate={createdStock.expirationDate}
          />
          <Alert color="teal" variant="light">
            {t("Šarže byla naskladněna a materiál zapsán na zakázku. Kód si opiš na obal.")}
          </Alert>
          <Group justify="flex-end">
            <Button onClick={onAdded}>{t("Zavřít")}</Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Select
            label={t("Materiál z katalogu")}
            required
            searchable
            placeholder={t("Hledat kód, název, výrobce…")}
            nothingFoundMessage={t("Nenalezeno")}
            data={catalog.map((c) => ({
              value: c.id,
              label: `[${c.code}] ${c.canonicalName} (${c.manufacturerName})`,
            }))}
            value={materialId}
            onChange={setMaterialId}
            disabled={submitting}
            filter={({ options, search }) => {
              const tokens = getSearchTokens(search);
              return (options as { value: string; label: string }[]).filter((o) =>
                matchesSearchTokens([o.label], tokens),
              );
            }}
          />
          {material && (
            <Box>
              <Text size="xs" c="dimmed" mb={8}>
                {material.activeLotCount > 0
                  ? t("Dostupných šarží: {n}", { n: material.activeLotCount })
                  : t("Materiál nemá žádnou dostupnou šarži.")}
              </Text>
              <LotSelectPanel
                key={`${material.id}-${panelNonce}`}
                materialCatalogId={material.id}
                submitting={submitting}
                confirmLabel={t("Použít na zakázce")}
                onConfirm={(choice) => void handleConfirm(choice)}
                leftFooter={
                  <Button variant="default" onClick={onClose} disabled={submitting}>
                    {t("Zrušit")}
                  </Button>
                }
              />
            </Box>
          )}
        </Stack>
      )}
    </Modal>
  );
}
