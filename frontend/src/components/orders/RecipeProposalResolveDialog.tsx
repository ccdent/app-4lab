import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconCheck, IconRotate } from "@tabler/icons-react";
import { api, ApiError } from "../../api/client";
import type { MaterialCatalogRow, MaterialProposalRow, StockItemByCode } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import { formatDateDDMMYYYY } from "../../shared/dates";
import ShortCodeSlotInput from "../form/ShortCodeSlotInput";
import { SHORT_CODE_SLOTS } from "../form/shortCodeUtils";
import LotSelectPanel, { type LotChoice } from "./LotSelectPanel";
import CreatedStockItemSummary from "../materials/CreatedStockItemSummary";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface Props {
  proposal: MaterialProposalRow;
  opened: boolean;
  onClose: () => void;
  onResolved: () => void;
}

function mapErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "BILLED_ORDER": return t("Zakázka je vyfakturovaná. Návrh nelze potvrdit.");
      case "STOCK_NOT_AVAILABLE": return t("Skladová položka mezitím přestala být dostupná. Vyber jinou.");
      case "PROPOSAL_NOT_PENDING": return t("Návrh už není ve stavu pending.");
      case "MATERIAL_MISMATCH": return t("Vybraný materiál neodpovídá očekávanému materiálu návrhu.");
      case "MATERIAL_NOT_ELIGIBLE": return t("Materiál není způsobilý pro použití na zakázce.");
    }
  }
  return err instanceof Error ? err.message : t("Potvrzení se nepodařilo");
}

/**
 * Vyřešení návrhu materiálu (1:1 crm-full):
 *  - placeholder → kód-first (ShortCodeSlotInput) + fallback výběr z katalogu,
 *  - catalog_item → rovnou LotSelectPanel (materiál fixní, MATERIAL_MISMATCH guard).
 * Potvrzení: existující šarže / nová Naskladnit / nová Jednorázově.
 */
export default function RecipeProposalResolveDialog({ proposal, opened, onClose, onResolved }: Props) {
  const isChangeLotFlow = proposal.lineType === "catalog_item";

  // Placeholder flow: materiál se teprve vybírá
  const [chosenMaterialId, setChosenMaterialId] = useState<string | null>(null);
  const [chosenMaterialLabel, setChosenMaterialLabel] = useState<string>("");
  const [catalog, setCatalog] = useState<MaterialCatalogRow[]>([]);

  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<StockItemByCode | "not_found" | null>(null);
  const [lastTriedCode, setLastTriedCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdStock, setCreatedStock] = useState<{
    shortCode: string;
    lotNumber: string;
    expirationDate: string;
    manufacturerName: string;
    canonicalName: string;
  } | null>(null);

  const materialId = isChangeLotFlow ? proposal.materialCatalogId : chosenMaterialId;
  // Remount panelu po částečném selhání (šarže vznikla, potvrzení ne).
  const [panelNonce, setPanelNonce] = useState(0);

  useEffect(() => {
    if (!opened) return;
    setChosenMaterialId(null);
    setChosenMaterialLabel("");
    setCode("");
    setLookup(null);
    setCreatedStock(null);
    if (!isChangeLotFlow) {
      void api
        .get<MaterialCatalogRow[]>("/material-catalog")
        .then(setCatalog)
        .catch(() => setCatalog([]));
    }
  }, [opened, isChangeLotFlow]);

  const lookupSeq = useRef(0);
  const handleLookup = async (normalized: string) => {
    if (normalized.length < SHORT_CODE_SLOTS) return;
    const seq = ++lookupSeq.current; // starší odpověď nesmí přepsat novější kód
    setLooking(true);
    setLookup(null);
    setLastTriedCode(normalized);
    try {
      const res = await api.get<StockItemByCode>(`/stock-items/by-short-code/${normalized}`);
      if (seq === lookupSeq.current) setLookup(res);
    } catch (err) {
      if (seq !== lookupSeq.current) return;
      if (err instanceof ApiError && err.status === 404) setLookup("not_found");
      else notifyError(err instanceof Error ? err.message : t("Hledání selhalo"));
    } finally {
      if (seq === lookupSeq.current) {
        setLooking(false);
        // Po vyhodnocení prázdné pole — výsledek/chyba se ukazují pod ním.
        setCode("");
      }
    }
  };

  const confirmExisting = async (stockItemId: string) => {
    setSubmitting(true);
    try {
      await api.post(`/material-proposals/${proposal.id}/confirm`, { stockItemId });
      notifySuccess(t("Materiál byl potvrzen a zapsán do zakázky."));
      onResolved();
    } catch (err) {
      notifyError(mapErrorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePanelConfirm = async (choice: LotChoice) => {
    if (!materialId) return;
    setSubmitting(true);
    try {
      if (choice.kind === "existing") {
        await api.post(`/material-proposals/${proposal.id}/confirm`, { stockItemId: choice.stockItemId });
        notifySuccess(t("Materiál byl potvrzen a zapsán do zakázky."));
        onResolved();
      } else if (choice.mode === "one_time") {
        await api.post(`/material-proposals/${proposal.id}/confirm-one-time`, {
          materialCatalogId: materialId,
          lotNumber: choice.lotNumber,
          expirationDate: choice.expirationDate,
        });
        notifySuccess(t("Materiál byl potvrzen a zapsán do zakázky."));
        onResolved();
      } else {
        // Naskladnit → confirm existující šarže.
        const created = await api.post<{ id: string; shortCode: string }>("/stock-items", {
          materialCatalogId: materialId,
          lotNumber: choice.lotNumber,
          expirationDate: choice.expirationDate,
        });
        try {
          await api.post(`/material-proposals/${proposal.id}/confirm`, { stockItemId: created.id });
        } catch (err) {
          notifyError(
            t("Šarže {kod} byla naskladněna, ale potvrzení selhalo: {chyba}. Šarže je teď v nabídce existujících.", {
              kod: created.shortCode,
              chyba: mapErrorText(err),
            }),
          );
          setPanelNonce((n) => n + 1); // refetch — šarže se objeví v seznamu
          return;
        }
        const mat = isChangeLotFlow
          ? {
              manufacturerName: proposal.manufacturerNameSnapshot ?? "",
              canonicalName: proposal.materialNameSnapshot ?? "",
            }
          : (() => {
              const m = catalog.find((x) => x.id === materialId);
              return { manufacturerName: m?.manufacturerName ?? "", canonicalName: m?.canonicalName ?? "" };
            })();
        setCreatedStock({
          shortCode: created.shortCode,
          lotNumber: choice.lotNumber,
          expirationDate: choice.expirationDate,
          ...mat,
        });
      }
    } catch (err) {
      notifyError(mapErrorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const lookupAvailable = lookup && lookup !== "not_found" && lookup.isAvailableForUsage;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (submitting) return; // potvrzení běží — nezavírat (unmount by ztratil výsledek)
        if (createdStock) onResolved();
        else onClose();
      }}
      title={t("Vyřešit návrh materiálu")}
      size={780}
      centered
    >
      <Stack gap="md">
        {/* Kontext návrhu */}
        <Box p="sm" style={{ backgroundColor: "light-dark(#f9fafb, #191919)", borderRadius: 8 }}>
          <Text size="xs" c="dimmed">{t("Recept:")} {proposal.sourceRecipeNameSnapshot}</Text>
          {isChangeLotFlow ? (
            <Text size="sm" fw={600}>
              {t("Materiál:")} {proposal.materialCodeSnapshot} — {proposal.materialNameSnapshot} (
              {proposal.manufacturerNameSnapshot})
            </Text>
          ) : (
            <Text size="sm" fw={600}>{t('Předpokládaný materiál: „{material}“', { material: proposal.placeholderText ?? "" })}</Text>
          )}
        </Box>

        {createdStock ? (
          <>
            <CreatedStockItemSummary
              shortCode={createdStock.shortCode}
              manufacturerName={createdStock.manufacturerName}
              canonicalName={createdStock.canonicalName}
              lotNumber={createdStock.lotNumber}
              expirationDate={createdStock.expirationDate}
            />
            <Alert color="teal" variant="light">
              {t("Šarže byla naskladněna a materiál potvrzen na této zakázce.")}
            </Alert>
            <Group justify="flex-end">
              <Button onClick={onResolved}>{t("Zavřít")}</Button>
            </Group>
          </>
        ) : !isChangeLotFlow && !chosenMaterialId ? (
          /* Placeholder flow — Stage 1: kód-first */
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={600} mb={6}>{t("1. Zadejte skladový kód materiálu")}</Text>
              <ShortCodeSlotInput
                value={code}
                autoFocus
                looking={looking}
                disabled={submitting}
                onChange={(v) => {
                  setCode(v);
                  if (v.length < SHORT_CODE_SLOTS) setLookup(null);
                }}
                onComplete={(v) => void handleLookup(v)}
                onSubmit={(v) => void handleLookup(v)}
                rightAddon={looking ? <Text size="sm" c="dimmed">{t("Hledám…")}</Text> : null}
              />
              <Text size="xs" c="dimmed" mt={4}>
                {t("Kód má 4 znaky. Po zadání se materiál automaticky dohledá.")}
              </Text>
            </Box>

            {lookup === "not_found" && (
              <Alert color="red" variant="light">{t('Kód „{kod}“ nebyl nalezen.', { kod: lastTriedCode })}</Alert>
            )}
            {lookup && lookup !== "not_found" && (
              <Box
                p="sm"
                style={{
                  backgroundColor: lookupAvailable ? "light-dark(#f0fdf4, #15301d)" : "light-dark(#fef2f2, #3a1d1d)",
                  border: `1px solid ${lookupAvailable ? "#A7F3D0" : "#FECACA"}`,
                  borderRadius: 8,
                }}
              >
                <Group justify="space-between" wrap="wrap" gap="sm">
                  <Box>
                    <Text size="sm" fw={600}>
                      {lookup.canonicalName}{" "}
                      <Text component="span" c="dimmed" ff="monospace">({lookup.materialCode})</Text>
                    </Text>
                    <Text size="xs" c="dimmed">{t("Výrobce:")} {lookup.manufacturerName}</Text>
                    <Text size="xs" c="dimmed">
                      LOT: {lookup.lotNumber} · EXP: {formatDateDDMMYYYY(lookup.expirationDate)}
                    </Text>
                    {!lookupAvailable && (
                      <Text size="xs" c="red.6" mt={2}>
                        {t("LOT je expirovaný, spotřebovaný nebo vyřazený.")}
                      </Text>
                    )}
                  </Box>
                  {lookupAvailable ? (
                    <Button
                      leftSection={<IconCheck size={16} />}
                      loading={submitting}
                      onClick={() => void confirmExisting(lookup.id)}
                    >
                      {t("Potvrdit")}
                    </Button>
                  ) : (
                    <Button
                      color="orange"
                      variant="light"
                      onClick={() => {
                        setChosenMaterialId(lookup.materialCatalogId);
                        setChosenMaterialLabel(
                          `${lookup.materialCode} — ${lookup.canonicalName} (${lookup.manufacturerName})`,
                        );
                      }}
                    >
                      {t("Vybrat jinou šarži")}
                    </Button>
                  )}
                </Group>
              </Box>
            )}

            <Box>
              <Text size="sm" c="dimmed" mb={6}>{t("Nemáte kód?")}</Text>
              <Select
                searchable
                placeholder={t("Procházet katalog materiálů…")}
                nothingFoundMessage={t("Nenalezeno")}
                data={catalog.map((c) => ({
                  value: c.id,
                  label: `[${c.code}] ${c.canonicalName} (${c.manufacturerName})`,
                }))}
                value={null}
                onChange={(v) => {
                  if (!v) return;
                  const m = catalog.find((x) => x.id === v);
                  setChosenMaterialId(v);
                  setChosenMaterialLabel(m ? `${m.code} — ${m.canonicalName} (${m.manufacturerName})` : "");
                }}
                filter={({ options, search }) => {
                  const tokens = getSearchTokens(search);
                  return (options as { value: string; label: string }[]).filter((o) =>
                    matchesSearchTokens([o.label], tokens),
                  );
                }}
              />
            </Box>

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>{t("Zrušit")}</Button>
            </Group>
          </Stack>
        ) : (
          /* Stage 2: materiál zvolený/fixní → výběr šarže */
          <Stack gap="md">
            {!isChangeLotFlow && (
              <Group gap={8}>
                <Text size="sm" fw={500}>{t("Materiál:")} {chosenMaterialLabel}</Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<IconRotate size={12} />}
                  onClick={() => {
                    setChosenMaterialId(null);
                    setLookup(null);
                    setCode("");
                  }}
                >
                  {t("Změnit")}
                </Button>
              </Group>
            )}
            {materialId && (
              <LotSelectPanel
                key={`${materialId}-${panelNonce}`}
                materialCatalogId={materialId}
                preferredStockItemId={proposal.suggestedStockItemId}
                submitting={submitting}
                confirmLabel={t("Potvrdit použití")}
                onConfirm={(choice) => void handlePanelConfirm(choice)}
                leftFooter={
                  <Button variant="default" onClick={onClose} disabled={submitting}>
                    {t("Zrušit")}
                  </Button>
                }
              />
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
