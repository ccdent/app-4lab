import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api, ApiError } from "../../api/client";
import PageHeader from "./PageHeader";
import DataTable from "./DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { confirm } from "../../lib/confirm";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface CodebookRow {
  id: string;
}

interface CodebookPageProps<T extends CodebookRow> {
  title: string;
  /** API prefix, např. "/price-list-categories". */
  endpoint: string;
  /** Popisek sloupce s počtem použití. */
  usageHeader: string;
  /** Kolik entit záznam používá — mazání blokuje server (409 IN_USE). */
  getUsage: (row: T) => number;
  addLabel: string;
  emptyMessage: string;
  /** Hlavní zobrazený text záznamu. */
  getLabel: (row: T) => string;
  /** Formulářová pole modalu; values řídí parent přes state. */
  renderFields: (values: Record<string, string>, setValue: (k: string, v: string) => void) => ReactNode;
  /** Klíče polí → payload. První pole je povinné. */
  fieldKeys: string[];
  /** Naplnění polí při editaci. */
  toValues: (row: T) => Record<string, string>;
  /** Jen ke čtení (bez oprávnění) — skryje přidání i akce řádků. */
  readOnly?: boolean;
  /** Volitelný sloupec mezi názvem a počtem použití (např. přiřazený návod). */
  extraColumn?: { header: string; width?: string; render: (row: T) => ReactNode };
}

/** Sdílená stránka malého číselníku (kategorie, skupiny…): tabulka + modal CRUD. */
export default function CodebookPage<T extends CodebookRow>({
  title,
  endpoint,
  usageHeader,
  getUsage,
  addLabel,
  emptyMessage,
  getLabel,
  renderFields,
  fieldKeys,
  toValues,
  readOnly = false,
  extraColumn,
}: CodebookPageProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<T[]>(endpoint));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst data"));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const setValue = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const openNew = () => {
    setEditing(null);
    setValues({});
    setModalOpen(true);
  };

  const openEdit = (row: T) => {
    setEditing(row);
    setValues(toValues(row));
    setModalOpen(true);
  };

  const primaryValue = (values[fieldKeys[0]] ?? "").trim();

  const handleSave = async () => {
    if (!primaryValue) return;
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        fieldKeys.map((k) => [k, (values[k] ?? "").trim() || null]),
      );
      payload[fieldKeys[0]] = primaryValue;
      if (editing) {
        await api.put(`${endpoint}/${editing.id}`, payload);
        notifySuccess(t("Uloženo."));
      } else {
        await api.post(endpoint, payload);
        notifySuccess(t("Přidáno."));
      }
      setModalOpen(false);
      void fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: T) => {
    const ok = await confirm({
      title: t("Smazat záznam"),
      message: t('Opravdu smazat „{name}"?', { name: getLabel(row) }),
      confirmLabel: t("Smazat"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`${endpoint}/${row.id}`);
      notifySuccess(t("Smazáno."));
      void fetchData();
    } catch (err) {
      notifyError(
        err instanceof ApiError && err.code === "IN_USE" ? err.message : t("Smazání se nepodařilo"),
      );
    }
  };

  const columns = [
    {
      key: "label",
      header: title,
      primary: true,
      render: (row: T) => (
        <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{getLabel(row)}</Text>
      ),
    },
    ...(extraColumn
      ? [{ key: "extra", header: extraColumn.header, width: extraColumn.width, render: extraColumn.render }]
      : []),
    {
      key: "usage",
      header: usageHeader,
      width: "20%",
      align: "center" as const,
      render: (row: T) => (
        <Badge size="sm" variant="light" color={getUsage(row) ? "teal" : "gray"}>
          {getUsage(row)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "12%",
      align: "right" as const,
      render: (row: T) =>
        readOnly ? null : (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label={t("Upravit")}>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => openEdit(row)}>
              <IconPencil size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Smazat")}>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => void handleDelete(row)}>
              <IconTrash size={18} />
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
            title={title}
            count={rows.length}
            primaryAction={readOnly ? undefined : { label: addLabel, onClick: openNew }}
          />
          <DataTable
            variant="card"
            columns={columns}
            data={rows}
            loading={loading}
            emptyMessage={emptyMessage}
            getRowKey={(r) => r.id}
          />
        </Box>
      </Box>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Upravit") : addLabel}
      >
        {renderFields(values, setValue)}
        <Group justify="flex-end" mt="md" gap="sm">
          <Button variant="default" onClick={() => setModalOpen(false)}>
            {t("Zrušit")}
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!primaryValue}>
            {editing ? t("Uložit") : t("Přidat")}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
