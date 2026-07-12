import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionIcon, Badge, Box, Checkbox, Group, Menu, Text, Tooltip } from "@mantine/core";
import { IconArchive, IconArchiveOff, IconDots, IconPencil, IconTrash } from "@tabler/icons-react";
import { api } from "../../../api/client";
import type { RecipeDetail, RecipeListRow } from "../../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../../shared/search";
import PageHeader from "../../../components/ui/PageHeader";
import DataTable from "../../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../../ui/tableStyles";
import { usePerms } from "../../../auth/usePerms";
import { confirm } from "../../../lib/confirm";
import { notifyError, notifySuccess } from "../../../lib/notify";
import { t } from "../../../i18n";

/** Recepty — šablony materiálového složení (1:1 crm-full). */
export default function RecipeListPage() {
  const perms = usePerms();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RecipeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const fetchSeq = useRef(0);
  const fetchData = useCallback(async (includeArchived: boolean) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const data = await api.get<RecipeListRow[]>(
        `/recipes${includeArchived ? "?includeArchived=1" : ""}`,
      );
      if (seq === fetchSeq.current) setRows(data);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst recepty"));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(showArchived);
  }, [fetchData, showArchived]);

  const setArchived = async (row: RecipeListRow, archived: boolean) => {
    const ok = await confirm(
      archived
        ? {
            title: t("Archivovat recept"),
            message:
              t("Archivovat tento recept? Nebude se zobrazovat v seznamu a nepoužije se při načtení receptů do zakázek. Už existující návrhy v zakázkách zůstanou beze změny."),
            confirmLabel: t("Archivovat"),
            variant: "danger",
          }
        : {
            title: t("Obnovit recept"),
            message: t("Obnovit tento recept? Znovu se objeví v seznamu a bude dostupný při načtení do zakázky."),
            confirmLabel: t("Obnovit"),
          },
    );
    if (!ok) return;
    try {
      // PUT vyžaduje kompletní payload — načíst detail a přepnout archived.
      const detail = await api.get<RecipeDetail>(`/recipes/${row.id}`);
      await api.put(`/recipes/${row.id}`, { ...detail, archived });
      notifySuccess(archived ? t("Recept byl archivován.") : t("Recept byl obnoven."));
      void fetchData(showArchived);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Akce se nepodařila"));
    }
  };

  const remove = async (row: RecipeListRow) => {
    const ok = await confirm({
      title: t("Smazat recept"),
      message: t('Trvale smazat recept "{name}"? Tato akce je nevratná. Existující návrhy v zakázkách zůstanou čitelné díky snapshotům, ale ztratí vazbu na šablonu.', { name: row.name }),
      confirmLabel: t("Smazat"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/recipes/${row.id}`);
      notifySuccess(t("Recept byl smazán."));
      void fetchData(showArchived);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Smazání se nepodařilo"));
    }
  };

  const filtered = useMemo(() => {
    const tokens = getSearchTokens(searchText);
    return rows.filter((r) => matchesSearchTokens([r.name, r.description ?? ""], tokens));
  }, [rows, searchText]);

  const columns = [
    {
      key: "name",
      header: t("Název"),
      sortable: false,
      primary: true,
      render: (r: RecipeListRow) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{r.name}</Text>
          {r.archived && <Badge size="xs" variant="light" color="gray">{t("archivováno")}</Badge>}
        </Group>
      ),
    },
    {
      key: "description",
      header: t("Popis"),
      mobileHidden: true,
      render: (r: RecipeListRow) => (
        <Text size="sm" c="dimmed" lineClamp={1}>{r.description ?? "—"}</Text>
      ),
    },
    {
      key: "items",
      header: t("Řádků"),
      width: "8%",
      align: "center" as const,
      render: (r: RecipeListRow) => <Text size="sm" c="dimmed">{r.itemCount}</Text>,
    },
    {
      key: "assigned",
      header: t("Přiřazeno k položkám"),
      width: "14%",
      align: "center" as const,
      mobileHidden: true,
      render: (r: RecipeListRow) => <Text size="sm" c="dimmed">{r.assignedCount}</Text>,
    },
    {
      key: "actions",
      header: "",
      width: "8%",
      align: "right" as const,
      render: (r: RecipeListRow) =>
        !perms.materialsEdit ? null : (
        <Group gap={4} justify="flex-end" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          <Tooltip label={t("Upravit")}>
            <ActionIcon variant="subtle" color="gray" onClick={() => navigate(`/app/materials/recipes/${r.id}`)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray"><IconDots size={16} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {r.archived ? (
                <Menu.Item leftSection={<IconArchiveOff size={14} />} onClick={() => void setArchived(r, false)}>
                  {t("Obnovit")}
                </Menu.Item>
              ) : (
                <Menu.Item
                  color="orange"
                  leftSection={<IconArchive size={14} />}
                  onClick={() => void setArchived(r, true)}
                >
                  {t("Archivovat")}
                </Menu.Item>
              )}
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => void remove(r)}>
                {t("Smazat")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
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
            title={t("Recepty materiálového složení")}
            count={filtered.length}
            primaryAction={perms.materialsEdit ? { label: t("Nový recept"), onClick: () => navigate("/app/materials/recipes/new") } : undefined}
            searchPlaceholder={t("Hledat název, popis…")}
            searchValue={searchText}
            onSearchChange={setSearchText}
          />
          <Group px={{ base: 12, sm: 24 }} py={8} style={{ borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)" }}>
            <Checkbox
              size="xs"
              label={t("Zobrazit archivované")}
              checked={showArchived}
              onChange={(e) => setShowArchived(e.currentTarget.checked)}
            />
          </Group>
          <DataTable
            variant="card"
            columns={columns}
            data={filtered}
            loading={loading}
            emptyMessage={t("Žádné recepty.")}
            getRowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/app/materials/recipes/${r.id}`)}
          />
        </Box>
      </Box>
    </Box>
  );
}
