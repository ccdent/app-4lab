import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Menu,
  Progress,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconBulb,
  IconCircleCheck,
  IconDots,
  IconLock,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { api, ApiError } from "../../api/client";
import type { MaterialProposalRow, ProposalSyncResult } from "../../api/types";
import { formatDateDDMMYYYY } from "../../shared/dates";
import { navrhyLabel } from "../../shared/materials";
import RecipeProposalResolveDialog from "./RecipeProposalResolveDialog";
import { confirm } from "../../lib/confirm";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

export interface ProposalStats {
  pending: number;
  resolved: number;
}

interface Props {
  orderId: string;
  isLocked: boolean;
  isBilled: boolean;
  onMaterialUsageChanged?: () => void;
  onProposalStatsChange?: (stats: ProposalStats | null) => void;
}

function statusBadge(status: MaterialProposalRow["status"]) {
  switch (status) {
    case "pending":
      return <Badge size="sm" variant="light" color="yellow">{t("K vyřešení")}</Badge>;
    case "resolved":
      return (
        <Badge size="sm" variant="light" color="teal" leftSection={<IconCircleCheck size={12} />}>
          {t("Vyřešeno")}
        </Badge>
      );
    case "discarded":
      return <Badge size="sm" variant="light" color="gray">{t("Zahozeno")}</Badge>;
    case "obsolete":
      return <Badge size="sm" variant="outline" color="gray">{t("Neaktuální")}</Badge>;
  }
}

/**
 * Návrhy z receptů — checklist materiálového složení (1:1 crm-full).
 * Lazy sync při mountu; resolved řádky zůstávají viditelné (progress);
 * discarded + obsolete za togglem. Ruční zápis materiálů návrhy neodškrtává.
 */
export default function OrderRecipeProposalsCard({
  orderId,
  isLocked,
  isBilled,
  onMaterialUsageChanged,
  onProposalStatsChange,
}: Props) {
  const [proposals, setProposals] = useState<MaterialProposalRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [resolveRow, setResolveRow] = useState<MaterialProposalRow | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(
    async (withSync: boolean) => {
      setLoadError(null);
      setSyncWarning(false);
      try {
        if (withSync && !isLocked) {
          try {
            const res = await api.post<ProposalSyncResult>(
              `/orders/${orderId}/material-proposals/sync`,
            );
            if (res.inserted + res.obsoleted + res.reactivated > 0) {
              const parts = [
                res.inserted > 0 ? t("+{n} nové", { n: res.inserted }) : null,
                res.reactivated > 0 ? t("{n} obnovené", { n: res.reactivated }) : null,
                res.obsoleted > 0 ? t("{n} neaktuální", { n: res.obsoleted }) : null,
              ].filter(Boolean);
              notifySuccess(t("Návrhy aktualizovány podle položek zakázky ({zmeny}).", { zmeny: parts.join(", ") }));
            }
          } catch {
            setSyncWarning(true);
          }
        }
        const rows = await api.get<MaterialProposalRow[]>(`/orders/${orderId}/material-proposals`);
        setProposals(rows);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : t("Načtení selhalo"));
        setProposals(null);
      }
    },
    [orderId, isLocked],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const stats = useMemo<ProposalStats | null>(() => {
    if (!proposals) return null;
    return {
      pending: proposals.filter((p) => p.status === "pending").length,
      resolved: proposals.filter((p) => p.status === "resolved").length,
    };
  }, [proposals]);

  useEffect(() => {
    onProposalStatsChange?.(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  const discard = async (p: MaterialProposalRow) => {
    const name = p.materialNameSnapshot ?? p.placeholderText ?? "—";
    const ok = await confirm({
      title: t("Zahodit návrh"),
      message: t('Zahodit návrh „{nazev}“? Návrh se neobnoví ani při změně položek — pro obnovu by ses musel ručně vrátit k receptu.', { nazev: name }),
      confirmLabel: t("Zahodit"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.post(`/material-proposals/${p.id}/discard`);
      notifySuccess(t("Návrh byl zahozen."));
      void load(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "BILLED_ORDER") {
        notifyError(t("Zakázka je vyfakturovaná. Návrh nelze zahodit."));
      } else if (err instanceof ApiError && err.code === "PROPOSAL_NOT_PENDING") {
        notifyError(t("Návrh už není ve stavu pending."));
      } else {
        notifyError(err instanceof Error ? err.message : t("Zahození se nepodařilo"));
      }
    }
  };

  const handleRefresh = async () => {
    setSyncing(true);
    await load(true);
    setSyncing(false);
  };

  if (proposals === null && loadError) {
    return (
      <Card withBorder id="recipe-proposals-card">
        <Group gap={8} mb="sm">
          <IconBulb size={20} color="#D97706" />
          <Title order={4}>{t("Návrhy z receptů")}</Title>
        </Group>
        <Alert color="red" variant="light">
          {t("Nepodařilo se načíst návrhy:")} {loadError}{" "}
          <Button size="compact-xs" variant="light" color="red" onClick={() => void load(true)}>
            {t("Zkusit znovu")}
          </Button>
        </Alert>
      </Card>
    );
  }
  if (proposals === null) return null;

  const pendingCount = stats?.pending ?? 0;
  const resolvedCount = stats?.resolved ?? 0;
  const total = pendingCount + resolvedCount;
  const hiddenRows = proposals.filter((p) => p.status === "discarded" || p.status === "obsolete");
  const visible = proposals.filter(
    (p) => p.status === "pending" || p.status === "resolved" || showHidden,
  );

  // Skupiny podle receptu
  const groups = new Map<string, MaterialProposalRow[]>();
  for (const p of visible) {
    const key = p.sourceRecipeNameSnapshot || t("Recept");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <Card withBorder id="recipe-proposals-card">
      <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
        <Group gap={8}>
          <IconBulb size={20} color="#D97706" />
          <Title order={4}>{t("Návrhy z receptů")}</Title>
          {pendingCount > 0 && (
            <Badge variant="filled" color="yellow">{pendingCount}</Badge>
          )}
        </Group>
        <Group gap={8}>
          {total > 0 && (
            <>
              <Text size="sm" c="dimmed">{t("{vyreseno}/{celkem} vyřešeno", { vyreseno: resolvedCount, celkem: total })}</Text>
              <Progress
                w={100}
                value={total ? (resolvedCount / total) * 100 : 0}
                color={pendingCount > 0 ? "yellow" : "teal"}
              />
            </>
          )}
          {isLocked && (
            <Tooltip label={t("Zakázka je zamčená")}>
              <IconLock size={16} style={{ color: "light-dark(#9ca3af, #7a7a7a)" }} />
            </Tooltip>
          )}
          {!isLocked && (
            <Tooltip label={t("Aktualizovat podle položek zakázky")}>
              <ActionIcon variant="subtle" color="gray" loading={syncing} onClick={() => void handleRefresh()}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {syncWarning && (
        <Alert color="yellow" variant="light" mb="sm">
          {t("Synchronizace návrhů selhala — zobrazený stav nemusí odpovídat položkám zakázky.")}
        </Alert>
      )}
      {isLocked && pendingCount > 0 && (
        <Alert color="blue" variant="light" mb="sm">
          {isBilled
            ? t("Zakázka je vyfakturovaná — materiálové složení nelze měnit. Návrhy zůstávají viditelné jako historie.")
            : t("Zakázka je dokončená — materiálové složení už nelze měnit. Pro úpravy vraťte zakázku do rozpracovaného stavu.")}
        </Alert>
      )}
      {!isLocked && pendingCount > 0 && (
        <Alert color="yellow" variant="light" mb="sm">
          {t("Materiálové složení není kompletní — zbývá vyřešit {n} {navrhy}.", { n: pendingCount, navrhy: t(navrhyLabel(pendingCount)) })}
        </Alert>
      )}

      {visible.length === 0 ? (
        <Text size="sm" c="dimmed">
          {hiddenRows.length > 0
            ? t('Žádné aktuální návrhy. Zaškrtni „Zobrazit zahozené a neaktuální“ pro plnou historii.')
            : t("Žádné recepty nenavazují na položky zakázky. Návrhy se doplní automaticky, jakmile položky zakázky odpovídají receptům (Materiály → Recepty).")}
        </Text>
      ) : (
        <Stack gap="md">
          {[...groups.entries()].map(([recipeName, rows]) => {
            const gPending = rows.filter((r) => r.status === "pending").length;
            const gResolved = rows.filter((r) => r.status === "resolved").length;
            const gTotal = gPending + gResolved;
            return (
              <Box key={recipeName}>
                <Group gap={8} mb={6}>
                  <Text size="sm" fw={600} c="light-dark(#374151, #cfcfcf)">{recipeName}</Text>
                  {gTotal > 0 && (
                    <Badge size="sm" variant="light" color={gPending > 0 ? "yellow" : "teal"}>
                      {gResolved}/{gTotal}
                    </Badge>
                  )}
                </Group>
                <Stack gap={6}>
                  {rows.map((p) => {
                    const dimmed = p.status === "discarded" || p.status === "obsolete";
                    return (
                      <Group
                        key={p.id}
                        justify="space-between"
                        wrap="wrap"
                        gap="sm"
                        p="sm"
                        style={{
                          border: "1px solid light-dark(#f3f4f6, #2a2a2a)",
                          borderRadius: 8,
                          opacity: dimmed ? 0.55 : 1,
                        }}
                      >
                        {/* Info o šarži vždy jako řádek POD názvem — dřív plavalo
                            mezi inline a zalomením podle šířky (rozsypaný vzhled). */}
                        <Group gap={10} wrap="nowrap" align="flex-start" style={{ flex: 1, minWidth: 240 }}>
                          <Badge
                            size="sm"
                            variant="light"
                            color={p.lineType === "placeholder" ? "yellow" : "blue"}
                            style={{ flexShrink: 0, marginTop: 2 }}
                          >
                            {p.lineType === "placeholder" ? t("Placeholder") : t("Materiál")}
                          </Badge>
                          <Box style={{ minWidth: 0 }}>
                            {p.lineType === "placeholder" ? (
                              <Text size="sm" fs="italic">„{p.placeholderText}“</Text>
                            ) : (
                              <>
                                <Text size="sm" fw={500}>{p.materialNameSnapshot}</Text>
                                <Text size="xs" c="dimmed">
                                  {p.materialCodeSnapshot} · {p.manufacturerNameSnapshot}
                                </Text>
                              </>
                            )}
                            {p.status === "pending" &&
                              (p.suggestedStockItemId ? (
                                <Group gap={4} mt={2}>
                                  <Text size="xs" c="dimmed">
                                    {t("kód")} {p.suggestedShortCode} · LOT {p.suggestedLotNumber} · EXP{" "}
                                    {formatDateDDMMYYYY(p.suggestedExpirationDate)}
                                  </Text>
                                  {!p.isSuggestedLotAvailable && (
                                    <Badge size="xs" variant="light" color="red">{t("nedostupný")}</Badge>
                                  )}
                                </Group>
                              ) : p.lineType === "catalog_item" ? (
                                <Badge
                                  size="xs"
                                  variant="light"
                                  color="orange"
                                  mt={4}
                                  leftSection={<IconAlertTriangle size={10} />}
                                >
                                  {t("šarže skladem není")}
                                </Badge>
                              ) : null)}
                          </Box>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                          {statusBadge(p.status)}
                          {p.status === "pending" && !isLocked && (
                            <>
                              <Button size="compact-sm" variant="light" onClick={() => setResolveRow(p)}>
                                {t("Vyřešit")}
                              </Button>
                              <Menu position="bottom-end">
                                <Menu.Target>
                                  <ActionIcon variant="subtle" color="gray">
                                    <IconDots size={16} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item
                                    color="red"
                                    leftSection={<IconTrash size={14} />}
                                    onClick={() => void discard(p)}
                                  >
                                    {t("Zahodit návrh")}
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            </>
                          )}
                        </Group>
                      </Group>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {hiddenRows.length > 0 && (
        <Checkbox
          mt="md"
          size="xs"
          label={t("Zobrazit zahozené a neaktuální")}
          checked={showHidden}
          onChange={(e) => setShowHidden(e.currentTarget.checked)}
        />
      )}

      {resolveRow && (
        <RecipeProposalResolveDialog
          proposal={resolveRow}
          opened={!!resolveRow}
          onClose={() => setResolveRow(null)}
          onResolved={() => {
            setResolveRow(null);
            void load(false);
            onMaterialUsageChanged?.();
          }}
        />
      )}
    </Card>
  );
}
