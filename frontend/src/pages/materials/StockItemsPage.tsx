import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowsShuffle,
  IconDots,
  IconEye,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { api } from "../../api/client";
import type { MaterialCatalogRow, StockItemRow } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import { formatDateDDMMYYYY } from "../../shared/dates";
import PageHeader from "../../components/ui/PageHeader";
import DataTable, { type SortState } from "../../components/ui/DataTable";
import ExpirationDateInput from "../../components/materials/ExpirationDateInput";
import CreatedStockItemSummary from "../../components/materials/CreatedStockItemSummary";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { displayShortCode, MODE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../../shared/materials";
import { confirm } from "../../lib/confirm";
import { usePerms } from "../../auth/usePerms";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

/** Kombinovaný default filtru: aktivní + použité (= dostupné šarže). */
const ACTIVE_USED_FILTER = "active_used";

interface UsageInspectRow {
  id: string;
  displayName: string;
  manufacturerName: string;
  lotNumber: string;
  expirationDate: string;
  sourceType: string;
  usedAt: number;
  usedByFirstName: string | null;
  usedByLastName: string | null;
  orderNumber?: string;
}

/** Šarže materiálů — sklad LOTů s lifecycle stavy (1:1 crm-full). */
export default function StockItemsPage() {
  const perms = usePerms();
  const [rows, setRows] = useState<StockItemRow[]>([]);
  const [catalog, setCatalog] = useState<MaterialCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(ACTIVE_USED_FILTER);
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState>({ column: "receivedAt", direction: "desc" });

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<StockItemRow | null>(null);
  const [statusRow, setStatusRow] = useState<StockItemRow | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [stockList, catalogList] = await Promise.all([
        api.get<StockItemRow[]>("/stock-items"),
        api.get<MaterialCatalogRow[]>("/material-catalog"),
      ]);
      setRows(stockList);
      setCatalog(catalogList);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst šarže"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /** Ruční dospotřebování šarže — zmizí z dostupných, historie zůstává. */
  const markConsumed = async (r: StockItemRow) => {
    const ok = await confirm({
      title: t("Spotřebovaný materiál"),
      message: t("Označit šarži {code} ({name}, LOT {lot}) jako spotřebovanou? Přestane se nabízet na zakázkách; historie použití zůstává beze změny.", { code: displayShortCode(r), name: r.canonicalName, lot: r.lotNumber }),
      confirmLabel: t("Spotřebováno"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.post(`/stock-items/${r.id}/status`, { status: "consumed" });
      notifySuccess(t("Šarže {code} označena jako spotřebovaná.", { code: displayShortCode(r) }));
      void fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Změna se nepodařila"));
    }
  };

  const filtered = useMemo(() => {
    const tokens = getSearchTokens(searchText);
    let result = rows.filter((r) => {
      if (statusFilter === ACTIVE_USED_FILTER) {
        if (r.status !== "active" && r.status !== "used") return false;
      } else if (statusFilter && r.status !== statusFilter) return false;
      if (modeFilter && r.consumptionMode !== modeFilter) return false;
      return matchesSearchTokens(
        [displayShortCode(r), r.lotNumber, r.canonicalName, r.manufacturerName],
        tokens,
      );
    });
    if (sortState.column && sortState.direction) {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortState.column) {
          case "code": aVal = displayShortCode(a); bVal = displayShortCode(b); break;
          case "material": aVal = a.canonicalName.toLowerCase(); bVal = b.canonicalName.toLowerCase(); break;
          case "lot": aVal = a.lotNumber.toLowerCase(); bVal = b.lotNumber.toLowerCase(); break;
          case "expiration": aVal = a.expirationDate; bVal = b.expirationDate; break;
          case "status": aVal = a.status; bVal = b.status; break;
          case "mode": aVal = a.consumptionMode; bVal = b.consumptionMode; break;
          case "receivedAt": aVal = a.receivedAt; bVal = b.receivedAt; break;
          case "firstUsedAt": aVal = a.firstUsedAt ?? 0; bVal = b.firstUsedAt ?? 0; break;
          default: return 0;
        }
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortState.direction === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, searchText, statusFilter, modeFilter, sortState]);

  const handleSort = (column: string) => {
    setSortState((s) => {
      if (s.column === column) {
        if (s.direction === "asc") return { column, direction: "desc" as const };
        if (s.direction === "desc") return { column: null, direction: null };
      }
      return { column, direction: "asc" as const };
    });
  };

  const today = dayjs().startOf("day");
  const columns = [
    {
      key: "code",
      header: t("Kód"),
      width: "8%",
      sortable: true,
      render: (r: StockItemRow) => (
        <Text size="sm" fw={600} ff="monospace" c="light-dark(#5F7A0A, #D3EC55)">{displayShortCode(r)}</Text>
      ),
    },
    {
      key: "material",
      header: t("Materiál"),
      sortable: true,
      primary: true,
      render: (r: StockItemRow) => (
        <Box>
          <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{r.canonicalName}</Text>
          <Text size="xs" c="dimmed">{r.manufacturerName}</Text>
        </Box>
      ),
    },
    {
      key: "lot",
      header: t("LOT"),
      width: "10%",
      sortable: true,
      render: (r: StockItemRow) => <Text size="sm" c="dimmed">{r.lotNumber}</Text>,
    },
    {
      key: "expiration",
      header: t("Expirace"),
      width: "10%",
      sortable: true,
      render: (r: StockItemRow) => {
        const expired = dayjs(r.expirationDate).isBefore(today, "day");
        return (
          <Text size="sm" c={expired ? "red.6" : "gray.7"} fw={expired ? 600 : 400}>
            {formatDateDDMMYYYY(r.expirationDate)}
          </Text>
        );
      },
    },
    {
      key: "status",
      header: t("Status"),
      width: "13%",
      sortable: true,
      render: (r: StockItemRow) => (
        <Badge size="sm" variant="light" color={STATUS_COLORS[r.status]}>
          {t(STATUS_LABELS[r.status])}
        </Badge>
      ),
    },
    {
      key: "mode",
      header: t("Režim"),
      width: "10%",
      sortable: true,
      mobileHidden: true,
      render: (r: StockItemRow) => (
        <Text size="sm" c="dimmed">{t(MODE_LABELS[r.consumptionMode])}</Text>
      ),
    },
    {
      key: "receivedAt",
      header: t("Vytvořeno"),
      width: "10%",
      sortable: true,
      mobileHidden: true,
      render: (r: StockItemRow) => (
        <Text size="sm" c="dimmed">{dayjs(r.receivedAt).format("DD.MM.YYYY")}</Text>
      ),
    },
    {
      key: "firstUsedAt",
      header: t("První použití"),
      width: "10%",
      sortable: true,
      mobileHidden: true,
      render: (r: StockItemRow) => (
        <Text size="sm" c="dimmed">
          {r.firstUsedAt ? dayjs(r.firstUsedAt).format("DD.MM.YYYY") : "—"}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "8%",
      align: "right" as const,
      render: (r: StockItemRow) => (
        <Group gap={4} justify="flex-end" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          {perms.materialsEdit && (
            <Tooltip label={t("Upravit metadata")}>
              <ActionIcon variant="subtle" color="gray" onClick={() => setEditRow(r)}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {perms.materialsEdit && (r.status === "active" || r.status === "used") && (
            <Tooltip label={t("Spotřebovaný materiál")}>
              <ActionIcon variant="subtle" color="red" onClick={() => void markConsumed(r)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {perms.materialsEdit && (
                <Menu.Item leftSection={<IconArrowsShuffle size={14} />} onClick={() => setStatusRow(r)}>
                  {t("Změnit status")}
                </Menu.Item>
              )}
              <Menu.Item leftSection={<IconEye size={14} />} onClick={() => setInspectRow(r)}>
                {t("Použití na zakázkách")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      ),
    },
  ];

  /* -------- usage inspector -------- */
  const [inspectRow, setInspectRow] = useState<StockItemRow | null>(null);

  return (
    <Box style={{ backgroundColor: CRM_TABLE_PAGE_BG, minHeight: "100%" }}>
      <Box p={{ base: 12, sm: 32 }}>
        <Box style={CRM_TABLE_CARD}>
          <PageHeader
            variant="card"
            title={t("Šarže materiálů")}
            count={filtered.length}
            // Naskladnění není editace — tlačítko má každý technik (server to povoluje).
            primaryAction={{ label: t("Nová šarže"), onClick: () => setCreateOpen(true) }}
            searchPlaceholder={t("Hledat kód, LOT, materiál…")}
            searchValue={searchText}
            onSearchChange={setSearchText}
          />
          <Group px={{ base: 12, sm: 24 }} py={8} gap="sm" style={{ borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)" }}>
            <Select
              size="xs"
              w={190}
              clearable
              placeholder={t("Všechny stavy")}
              value={statusFilter}
              onChange={setStatusFilter}
              data={[
                { value: ACTIVE_USED_FILTER, label: t("Aktivní + Použitý") },
                { value: "active", label: t("Aktivní") },
                { value: "used", label: t("Použitý") },
                { value: "consumed", label: t("Spotřebovaný") },
                { value: "discarded", label: t("Vyřazený") },
              ]}
            />
            <Select
              size="xs"
              w={170}
              clearable
              placeholder={t("Všechny režimy")}
              value={modeFilter}
              onChange={setModeFilter}
              data={[
                { value: "reusable_lot", label: t("Opakovaný") },
                { value: "one_time", label: t("Jednorázový") },
              ]}
            />
          </Group>
          <DataTable
            variant="card"
            columns={columns}
            data={filtered}
            loading={loading}
            emptyMessage={t("Žádné šarže.")}
            getRowKey={(r) => r.id}
            sortState={sortState}
            onSort={handleSort}
          />
        </Box>
      </Box>

      <CreateStockModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        catalog={catalog}
        onCreated={() => void fetchData()}
      />
      <EditStockModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => void fetchData()} />
      <StatusOverrideModal row={statusRow} onClose={() => setStatusRow(null)} onSaved={() => void fetchData()} />
      <UsageInspectorModal row={inspectRow} onClose={() => setInspectRow(null)} />
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Nová šarže                                                          */
/* ------------------------------------------------------------------ */

function CreateStockModal({
  opened,
  onClose,
  catalog,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  catalog: MaterialCatalogRow[];
  onCreated: () => void;
}) {
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [expiration, setExpiration] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ shortCode: string } | null>(null);

  const reset = (keepMaterial: boolean) => {
    if (!keepMaterial) setMaterialId(null);
    setLotNumber("");
    setExpiration(null);
    setCreated(null);
  };

  const material = catalog.find((c) => c.id === materialId);

  const submit = async () => {
    if (!materialId) return notifyError(t("Materiál je povinný"));
    if (!lotNumber.trim()) return notifyError(t("Šarže (LOT) je povinná"));
    if (!expiration) return notifyError(t("Expirace je povinná"));
    setSaving(true);
    try {
      const res = await api.post<{ id: string; shortCode: string }>("/stock-items", {
        materialCatalogId: materialId,
        lotNumber: lotNumber.trim(),
        expirationDate: expiration,
      });
      notifySuccess(t("Šarže {code} byla vytvořena.", { code: res.shortCode }));
      setCreated({ shortCode: res.shortCode });
      onCreated();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Vytvoření se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => { reset(false); onClose(); }}
      title={t("Nová šarže materiálu")}
      size="lg"
      centered
    >
      {created && material ? (
        <Stack gap="md">
          <CreatedStockItemSummary
            shortCode={created.shortCode}
            manufacturerName={material.manufacturerName}
            canonicalName={material.canonicalName}
            lotNumber={lotNumber}
            expirationDate={expiration}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => { reset(false); onClose(); }}>{t("Zavřít")}</Button>
            <Button onClick={() => reset(true)}>{t("Přidat další šarži")}</Button>
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
            data={catalog
              .filter((c) => c.isActive)
              .map((c) => ({ value: c.id, label: `[${c.code}] ${c.canonicalName} (${c.manufacturerName})` }))}
            value={materialId}
            onChange={setMaterialId}
            filter={({ options, search }) => {
              const tokens = getSearchTokens(search);
              return (options as { value: string; label: string }[]).filter((o) =>
                matchesSearchTokens([o.label], tokens),
              );
            }}
          />
          <TextInput
            label={t("Šarže (LOT)")}
            required
            placeholder={t("Např. L2026-0815")}
            value={lotNumber}
            onChange={(e) => setLotNumber(e.currentTarget.value)}
          />
          <ExpirationDateInput required value={expiration} onChange={setExpiration} />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => { reset(false); onClose(); }}>{t("Zrušit")}</Button>
            <Button loading={saving} onClick={() => void submit()}>{t("Vytvořit")}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Editace metadat                                                     */
/* ------------------------------------------------------------------ */

function EditStockModal({
  row,
  onClose,
  onSaved,
}: {
  row: StockItemRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lotNumber, setLotNumber] = useState("");
  const [expiration, setExpiration] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setLotNumber(row.lotNumber);
      setExpiration(row.expirationDate);
    }
  }, [row]);

  const submit = async () => {
    if (!row) return;
    if (!lotNumber.trim()) return notifyError(t("Šarže (LOT) je povinná"));
    if (!expiration) return notifyError(t("Expirace je povinná"));
    setSaving(true);
    try {
      await api.put(`/stock-items/${row.id}`, { lotNumber: lotNumber.trim(), expirationDate: expiration });
      notifySuccess(t("Metadata šarže byla upravena."));
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!row} onClose={onClose} title={t("Upravit metadata šarže")} size="md" centered>
      {row && (
        <Stack gap="md">
          <Box style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Box>
              <Text size="xs" c="dimmed">{t("Kód")}</Text>
              <Text size="sm" fw={600} ff="monospace">{displayShortCode(row)}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">{t("Status")}</Text>
              <Badge size="sm" variant="light" color={STATUS_COLORS[row.status]}>
                {t(STATUS_LABELS[row.status])}
              </Badge>
            </Box>
            <Box style={{ gridColumn: "1 / -1" }}>
              <Text size="xs" c="dimmed">{t("Materiál")}</Text>
              <Text size="sm" fw={500}>{row.manufacturerName} – {row.canonicalName}</Text>
            </Box>
          </Box>
          <TextInput
            label={t("Šarže (LOT)")}
            required
            value={lotNumber}
            onChange={(e) => setLotNumber(e.currentTarget.value)}
          />
          <ExpirationDateInput required value={expiration} onChange={setExpiration} />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose}>{t("Zrušit")}</Button>
            <Button loading={saving} onClick={() => void submit()}>{t("Uložit")}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin override statusu                                              */
/* ------------------------------------------------------------------ */

function StatusOverrideModal({
  row,
  onClose,
  onSaved,
}: {
  row: StockItemRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setStatus(row.status);
  }, [row]);

  const submit = async () => {
    if (!row || !status) return;
    setSaving(true);
    try {
      await api.post(`/stock-items/${row.id}/status`, { status });
      notifySuccess(t('Status změněn na "{status}".', { status: t(STATUS_LABELS[status]) }));
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Změna se nepodařila"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!row} onClose={onClose} title={t("Admin: Změna statusu")} size="sm" centered>
      {row && (
        <Stack gap="md">
          <Alert color="yellow" variant="light">
            {t("Toto je admin override. Změna statusu obchází běžný workflow (použití na zakázce nastavuje stavy samo) a může ovlivnit konzistenci dat.")}
          </Alert>
          <Text size="sm">
            <Text component="span" ff="monospace" fw={600}>{displayShortCode(row)}</Text>
            {" — "}{row.canonicalName}
          </Text>
          <Select
            label={t("Nový status")}
            value={status}
            onChange={setStatus}
            data={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label: t(label) }))}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose}>{t("Zrušit")}</Button>
            <Button
              color={status !== row.status ? "yellow" : undefined}
              loading={saving}
              onClick={() => void submit()}
            >
              {t("Změnit status")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Použití šarže na zakázkách                                          */
/* ------------------------------------------------------------------ */

function UsageInspectorModal({ row, onClose }: { row: StockItemRow | null; onClose: () => void }) {
  const [usages, setUsages] = useState<UsageInspectRow[] | null>(null);

  useEffect(() => {
    if (!row) {
      setUsages(null);
      return;
    }
    let cancelled = false; // pozdní odpověď starého řádku nesmí přepsat nový
    void api
      .get<UsageInspectRow[]>(`/stock-items/${row.id}/usages`)
      .then((u) => {
        if (!cancelled) setUsages(u);
      })
      .catch(() => {
        if (!cancelled) setUsages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [row]);

  return (
    <Modal
      opened={!!row}
      onClose={onClose}
      title={row ? t("Použití šarže {code} na zakázkách", { code: displayShortCode(row) }) : ""}
      size="lg"
      centered
    >
      {!usages ? null : usages.length === 0 ? (
        <Text size="sm" c="dimmed">{t("Tento LOT zatím nemá žádné použití na zakázkách.")}</Text>
      ) : (
        <Stack gap={8}>
          {usages.map((u) => (
            <Box key={u.id} p="sm" style={{ backgroundColor: "light-dark(#f9fafb, #191919)", borderRadius: 8 }}>
              <Box style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Box>
                  <Text size="xs" c="dimmed">{t("Zakázka")}</Text>
                  <Text size="sm" ff="monospace" fw={600}>{u.orderNumber ?? "—"}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">{t("Použito")}</Text>
                  <Text size="sm">{dayjs(u.usedAt).format("DD.MM.YYYY HH:mm")}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">{t("Materiál (snapshot)")}</Text>
                  <Text size="sm">{u.manufacturerName} – {u.displayName}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">{t("Použil")}</Text>
                  <Text size="sm">
                    {u.usedByFirstName ? `${u.usedByFirstName} ${u.usedByLastName}` : "—"}
                  </Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">{t("LOT (snapshot)")}</Text>
                  <Text size="sm">{u.lotNumber}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">{t("Expirace (snapshot)")}</Text>
                  <Text size="sm">{formatDateDDMMYYYY(u.expirationDate)}</Text>
                </Box>
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Modal>
  );
}
