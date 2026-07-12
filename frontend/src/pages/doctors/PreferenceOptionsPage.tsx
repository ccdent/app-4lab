import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api, ApiError } from "../../api/client";
import type { PreferenceOption } from "../../api/types";
import PageHeader from "../../components/ui/PageHeader";
import DataTable from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { usePerms } from "../../auth/usePerms";
import { confirm } from "../../lib/confirm";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

/** Číselník preferenčních možností (chips) pro doktory. */
export default function PreferenceOptionsPage() {
  const perms = usePerms();
  const [options, setOptions] = useState<PreferenceOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal pro přidání/přejmenování
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PreferenceOption | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setOptions(await api.get<PreferenceOption[]>("/preference-options"));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst možnosti"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openNew = () => {
    setEditing(null);
    setLabel("");
    setModalOpen(true);
  };

  const openEdit = (o: PreferenceOption) => {
    setEditing(o);
    setLabel(o.label);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/preference-options/${editing.id}`, { label: label.trim() });
        notifySuccess(t("Možnost přejmenována."));
      } else {
        await api.post("/preference-options", { label: label.trim() });
        notifySuccess(t("Možnost přidána."));
      }
      setModalOpen(false);
      void fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (o: PreferenceOption) => {
    const ok = await confirm({
      title: t("Smazat možnost"),
      message: t('Opravdu smazat „{name}"?', { name: o.label }),
      confirmLabel: t("Smazat"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/preference-options/${o.id}`);
      notifySuccess(t("Možnost smazána."));
      void fetchData();
    } catch (err) {
      notifyError(
        err instanceof ApiError && err.code === "IN_USE"
          ? err.message
          : t("Smazání se nepodařilo"),
      );
    }
  };

  const columns = [
    {
      key: "label",
      header: t("Možnost"),
      primary: true,
      render: (o: PreferenceOption) => (
        <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{o.label}</Text>
      ),
    },
    {
      key: "usage",
      header: t("Použito u doktorů"),
      width: "20%",
      align: "center" as const,
      render: (o: PreferenceOption) => (
        <Badge size="sm" variant="light" color={o.usageCount ? "teal" : "gray"}>
          {o.usageCount}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "12%",
      align: "right" as const,
      render: (o: PreferenceOption) =>
        !perms.doctorsEdit ? null : (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label={t("Přejmenovat")}>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => openEdit(o)}>
              <IconPencil size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Smazat")}>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => void handleDelete(o)}
            >
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
            title={t("Preference doktorů")}
            count={options.length}
            primaryAction={perms.doctorsEdit ? { label: t("Nová možnost"), onClick: openNew } : undefined}
          />
          <DataTable
            variant="card"
            columns={columns}
            data={options}
            loading={loading}
            emptyMessage={t("Zatím žádné možnosti — přidej první.")}
            getRowKey={(o) => o.id}
          />
        </Box>
      </Box>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Přejmenovat možnost") : t("Nová možnost")}
      >
        <TextInput
          label={t("Text")}
          placeholder={t("např. Nemá rád vysoký skus")}
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSave();
            }
          }}
          data-autofocus
        />
        <Group justify="flex-end" mt="md" gap="sm">
          <Button variant="default" onClick={() => setModalOpen(false)}>
            {t("Zrušit")}
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!label.trim()}>
            {editing ? t("Uložit") : t("Přidat")}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
