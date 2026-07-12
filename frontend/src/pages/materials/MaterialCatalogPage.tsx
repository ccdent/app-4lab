import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconPencil, IconPlus, IconX } from "@tabler/icons-react";
import { api } from "../../api/client";
import type { ManufacturerRow, MaterialCatalogRow } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import PageHeader from "../../components/ui/PageHeader";
import DataTable, { type SortState } from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { confirm } from "../../lib/confirm";
import { usePerms } from "../../auth/usePerms";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

/** Katalog materiálů — povinný standardizovaný číselník typů (1:1 crm-full). */
export default function MaterialCatalogPage() {
  const perms = usePerms();
  const [rows, setRows] = useState<MaterialCatalogRow[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>("active");
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [formRow, setFormRow] = useState<MaterialCatalogRow | null | "new">(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogList, mfrList] = await Promise.all([
        api.get<MaterialCatalogRow[]>("/material-catalog?includeInactive=1"),
        api.get<ManufacturerRow[]>("/manufacturers"),
      ]);
      setRows(catalogList);
      setManufacturers(mfrList);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst katalog"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggleActive = async (row: MaterialCatalogRow) => {
    if (row.isActive) {
      const ok = await confirm({
        title: t("Deaktivovat položku katalogu"),
        message: t("Položka [{code}] {name} zmizí z katalogu i z výběrů materiálu (nová šarže, použití na zakázce). Existující šarže a historie použití zůstávají beze změny. Položku lze kdykoli znovu aktivovat.", { code: row.code, name: row.canonicalName }),
        confirmLabel: t("Deaktivovat"),
        variant: "danger",
      });
      if (!ok) return;
    }
    try {
      await api.put(`/material-catalog/${row.id}`, {
        canonicalName: row.canonicalName,
        isActive: !row.isActive,
      });
      notifySuccess(
        row.isActive
          ? t("Položka [{code}] byla deaktivována.", { code: row.code })
          : t("Položka [{code}] byla znovu aktivována.", { code: row.code }),
      );
      void fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Změna se nepodařila"));
    }
  };

  const filtered = useMemo(() => {
    const tokens = getSearchTokens(searchText);
    let result = rows.filter((r) => {
      if (activeFilter === "active" && !r.isActive) return false;
      if (activeFilter === "inactive" && r.isActive) return false;
      return matchesSearchTokens([r.code, r.canonicalName, r.manufacturerName], tokens);
    });
    if (sortState.column && sortState.direction) {
      result = [...result].sort((a, b) => {
        let aVal: string;
        let bVal: string;
        switch (sortState.column) {
          case "code": aVal = a.code; bVal = b.code; break;
          case "manufacturer": aVal = a.manufacturerName.toLowerCase(); bVal = b.manufacturerName.toLowerCase(); break;
          case "name": aVal = a.canonicalName.toLowerCase(); bVal = b.canonicalName.toLowerCase(); break;
          default: return 0;
        }
        const cmp = aVal.localeCompare(bVal, "cs", { numeric: true });
        return sortState.direction === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, searchText, activeFilter, sortState]);

  const handleSort = (column: string) => {
    setSortState((s) => {
      if (s.column === column) {
        if (s.direction === "asc") return { column, direction: "desc" as const };
        if (s.direction === "desc") return { column: null, direction: null };
      }
      return { column, direction: "asc" as const };
    });
  };

  const columns = [
    {
      key: "code",
      header: t("Kód"),
      width: "12%",
      sortable: true,
      render: (r: MaterialCatalogRow) => (
        <Text size="sm" fw={600} ff="monospace" style={{ color: "light-dark(#111827, #ececec)" }}>{r.code}</Text>
      ),
    },
    {
      key: "manufacturer",
      header: t("Výrobce"),
      width: "18%",
      sortable: true,
      render: (r: MaterialCatalogRow) => <Text size="sm" c="dimmed">{r.manufacturerName}</Text>,
    },
    {
      key: "name",
      header: t("Název"),
      sortable: true,
      primary: true,
      render: (r: MaterialCatalogRow) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600} style={{ color: r.isActive ? "light-dark(#111827, #ececec)" : "light-dark(#9ca3af, #7a7a7a)" }}>
            {r.canonicalName}
          </Text>
          {!r.isActive && (
            <Badge size="xs" variant="light" color="gray">{t("Deaktivováno")}</Badge>
          )}
        </Group>
      ),
    },
    {
      key: "lots",
      header: t("Aktivní LOTy"),
      width: "12%",
      align: "center" as const,
      mobileHidden: true,
      render: (r: MaterialCatalogRow) => (
        <Badge size="sm" variant="light" color={r.activeLotCount > 0 ? "teal" : "gray"}>
          {r.activeLotCount}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "8%",
      align: "right" as const,
      render: (r: MaterialCatalogRow) =>
        !perms.materialsEdit ? null : (
        <Group gap={4} justify="flex-end" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          <Tooltip label={t("Upravit")}>
            <ActionIcon variant="subtle" color="gray" onClick={() => setFormRow(r)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={r.isActive ? t("Deaktivovat (skrýt z katalogu)") : t("Znovu aktivovat")}>
            <ActionIcon
              variant="subtle"
              color={r.isActive ? "gray" : "teal"}
              onClick={() => void toggleActive(r)}
            >
              {r.isActive ? <IconArchive size={16} /> : <IconArchiveOff size={16} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  return (
    <Box style={{ backgroundColor: CRM_TABLE_PAGE_BG, minHeight: "100%" }}>
      <Box p={{ base: 12, sm: 32 }}>
        <Box style={CRM_TABLE_CARD}>
          <PageHeader
            variant="card"
            title={t("Katalog materiálů")}
            count={filtered.length}
            primaryAction={perms.materialsEdit ? { label: t("Nová položka"), onClick: () => setFormRow("new") } : undefined}
            searchPlaceholder={t("Hledat kód, název, výrobce…")}
            searchValue={searchText}
            onSearchChange={setSearchText}
          />
          <Group px={{ base: 12, sm: 24 }} py={8} gap="sm" style={{ borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)" }}>
            <Select
              size="xs"
              w={190}
              clearable
              placeholder={t("Vše (i deaktivované)")}
              value={activeFilter}
              onChange={setActiveFilter}
              data={[
                { value: "active", label: t("Aktivní") },
                { value: "inactive", label: t("Deaktivované") },
              ]}
            />
          </Group>
          <DataTable
            variant="card"
            columns={columns}
            data={filtered}
            loading={loading}
            emptyMessage={t("Katalog je prázdný.")}
            getRowKey={(r) => r.id}
            sortState={sortState}
            onSort={handleSort}
          />
        </Box>
      </Box>

      <CatalogFormModal
        row={formRow}
        manufacturers={manufacturers}
        onClose={() => setFormRow(null)}
        onSaved={() => void fetchData()}
      />
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Create/Edit modal + quick-create výrobce                            */
/* ------------------------------------------------------------------ */

function CatalogFormModal({
  row,
  manufacturers,
  onClose,
  onSaved,
}: {
  row: MaterialCatalogRow | null | "new";
  manufacturers: ManufacturerRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editRow = row !== "new" ? row : null;
  const isEdit = editRow !== null;
  const [manufacturerId, setManufacturerId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [localMfrs, setLocalMfrs] = useState<ManufacturerRow[]>([]);

  // Inline založení výrobce (žádný modal v modalu).
  const [mfrFormOpen, setMfrFormOpen] = useState(false);
  const [mfrName, setMfrName] = useState("");
  const [mfrPrefix, setMfrPrefix] = useState("");
  const [mfrSaving, setMfrSaving] = useState(false);

  useEffect(() => {
    setLocalMfrs(manufacturers);
  }, [manufacturers]);

  useEffect(() => {
    if (row === "new") {
      setManufacturerId(null);
      setName("");
    } else if (row) {
      setManufacturerId(row.manufacturerId);
      setName(row.canonicalName);
    }
    setMfrFormOpen(false);
    setMfrName("");
    setMfrPrefix("");
  }, [row]);

  const createManufacturer = async () => {
    if (!mfrName.trim()) return notifyError(t("Název výrobce je povinný"));
    if (!/^[A-Z0-9]{2,10}$/.test(mfrPrefix)) {
      return notifyError(t("Prefix musí být 2–10 velkých písmen/číslic (A–Z, 0–9)"));
    }
    setMfrSaving(true);
    try {
      const res = await api.post<{ id: string }>("/manufacturers", {
        name: mfrName.trim(),
        codePrefix: mfrPrefix,
      });
      notifySuccess(t('Výrobce "{name}" byl vytvořen.', { name: mfrName.trim() }));
      const created: ManufacturerRow = {
        id: res.id,
        name: mfrName.trim(),
        codePrefix: mfrPrefix,
        isActive: true,
        catalogCount: 0,
      };
      setLocalMfrs((prev) => [...prev, created]);
      setManufacturerId(created.id);
      setMfrFormOpen(false);
      setMfrName("");
      setMfrPrefix("");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Vytvoření se nepodařilo"));
    } finally {
      setMfrSaving(false);
    }
  };

  const submit = async () => {
    if (!isEdit && !manufacturerId) return notifyError(t("Výrobce je povinný"));
    if (!name.trim()) return notifyError(t("Název je povinný"));
    setSaving(true);
    try {
      if (editRow) {
        await api.put(`/material-catalog/${editRow.id}`, {
          canonicalName: name.trim(),
          isActive: editRow.isActive,
        });
        notifySuccess(t("Katalogová položka byla upravena."));
      } else {
        const res = await api.post<{ id: string; code: string }>("/material-catalog", {
          manufacturerId,
          canonicalName: name.trim(),
        });
        notifySuccess(t("Katalogová položka [{code}] byla vytvořena.", { code: res.code }));
      }
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={row !== null}
      onClose={onClose}
      title={isEdit ? t("Upravit katalogovou položku") : t("Nová katalogová položka")}
      size="md"
      centered
    >
        <Stack gap="md">
          {editRow && (
            <Box>
              <Text size="xs" c="dimmed">{t("Kód (neměnný)")}</Text>
              <Text size="sm" fw={600} ff="monospace">{editRow.code}</Text>
            </Box>
          )}
          <Group gap={8} align="flex-end" wrap="nowrap">
            <Select
              label={t("Výrobce")}
              required
              searchable
              style={{ flex: 1 }}
              disabled={isEdit || mfrFormOpen}
              data={localMfrs.map((m) => ({ value: m.id, label: `${m.name} (${m.codePrefix})` }))}
              value={manufacturerId}
              onChange={setManufacturerId}
            />
            {!isEdit && (
              <Tooltip label={mfrFormOpen ? t("Zavřít nového výrobce") : t("Nový výrobce")}>
                <ActionIcon
                  size={36}
                  variant={mfrFormOpen ? "filled" : "light"}
                  color="teal"
                  onClick={() => setMfrFormOpen((o) => !o)}
                >
                  {mfrFormOpen ? <IconX size={18} /> : <IconPlus size={18} />}
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          {!isEdit && mfrFormOpen && (
            <Stack
              gap="sm"
              p="sm"
              style={{ backgroundColor: "light-dark(#f9fafb, #191919)", border: "1px dashed light-dark(#9ca3af, #7a7a7a)", borderRadius: 8 }}
            >
              <Text size="sm" fw={600}>{t("Nový výrobce")}</Text>
              {/* Mobil: pole pod sebou — vedle sebe se do modalu nevejdou. */}
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <TextInput
                  label={t("Název výrobce")}
                  required
                  placeholder={t("Např. Ivoclar Vivadent")}
                  value={mfrName}
                  onChange={(e) => setMfrName(e.currentTarget.value)}
                />
                <TextInput
                  label={t("Prefix kódu")}
                  required
                  placeholder={t("Např. IVO")}
                  value={mfrPrefix}
                  onChange={(e) => setMfrPrefix(e.currentTarget.value.toUpperCase())}
                />
              </SimpleGrid>
              <Text size="xs" c="dimmed">
                {t("Prefix: velká písmena/číslice, 2–10 znaků; použije se pro generování kódů katalogu (IVO-0001).")}
              </Text>
              <Group justify="flex-end">
                <Button size="xs" loading={mfrSaving} onClick={() => void createManufacturer()}>
                  {t("Vytvořit výrobce")}
                </Button>
              </Group>
            </Stack>
          )}
          <TextInput
            label={t("Název materiálu")}
            required
            placeholder={t("Např. IPS e.max Press")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose}>{t("Zrušit")}</Button>
            <Button loading={saving} disabled={mfrFormOpen} onClick={() => void submit()}>
              {isEdit ? t("Uložit") : t("Vytvořit")}
            </Button>
          </Group>
        </Stack>
    </Modal>
  );
}
