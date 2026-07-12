import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api, ApiError } from "../../api/client";
import type { CustomerGroup } from "../../api/types";
import PageHeader from "../../components/ui/PageHeader";
import DataTable from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { confirm } from "../../lib/confirm";
import { usePerms } from "../../auth/usePerms";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface FormState {
  name: string;
  note: string;
  isDefault: boolean;
}

const EMPTY: FormState = { name: "", note: "", isDefault: false };

export default function GroupsPage() {
  const perms = usePerms();
  const [rows, setRows] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerGroup | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<CustomerGroup[]>("/customer-groups"));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst skupiny"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (g: CustomerGroup) => {
    setEditing(g);
    setForm({ name: g.name, note: g.note ?? "", isDefault: g.isDefault });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        note: form.note.trim() || null,
        isDefault: form.isDefault,
      };
      if (editing) {
        await api.put(`/customer-groups/${editing.id}`, payload);
        notifySuccess(t("Skupina uložena."));
      } else {
        await api.post("/customer-groups", payload);
        notifySuccess(t("Skupina přidána."));
      }
      setModalOpen(false);
      void fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: CustomerGroup) => {
    const ok = await confirm({
      title: t("Smazat skupinu"),
      message: t('Opravdu smazat „{name}"?', { name: g.name }),
      confirmLabel: t("Smazat"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/customer-groups/${g.id}`);
      notifySuccess(t("Skupina smazána."));
      void fetchData();
    } catch (err) {
      notifyError(
        err instanceof ApiError && err.code === "IN_USE" ? err.message : t("Smazání se nepodařilo"),
      );
    }
  };

  const columns = [
    {
      key: "name",
      header: t("Skupina"),
      primary: true,
      render: (g: CustomerGroup) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{g.name}</Text>
          {g.isDefault && (
            <Badge size="xs" variant="light" color="teal">{t("Výchozí")}</Badge>
          )}
        </Group>
      ),
    },
    {
      key: "note",
      header: t("Poznámka"),
      width: "30%",
      mobileHidden: true,
      render: (g: CustomerGroup) => <Text size="sm" c="dimmed">{g.note ?? "—"}</Text>,
    },
    {
      key: "usage",
      header: t("Položek"),
      width: "12%",
      align: "center" as const,
      render: (g: CustomerGroup) => (
        <Badge size="sm" variant="light" color={g.itemCount ? "teal" : "gray"}>
          {g.itemCount}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "12%",
      align: "right" as const,
      render: (g: CustomerGroup) =>
        !perms.priceListEdit ? null : (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label={t("Upravit")}>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => openEdit(g)}>
              <IconPencil size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Smazat")}>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => void handleDelete(g)}>
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
            title={t("Skupiny ceníku")}
            count={rows.length}
            primaryAction={perms.priceListEdit ? { label: t("Nová skupina"), onClick: openNew } : undefined}
          />
          <DataTable
            variant="card"
            columns={columns}
            data={rows}
            loading={loading}
            emptyMessage={t("Zatím žádné skupiny. Položka bez skupiny se nenabízí v zakázkách.")}
            getRowKey={(g) => g.id}
          />
        </Box>
      </Box>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Upravit skupinu") : t("Nová skupina")}
      >
        <Stack gap="sm">
          <TextInput
            label={t("Název")}
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
            data-autofocus
          />
          <TextInput
            label={t("Poznámka")}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.currentTarget.value }))}
          />
          <Switch
            label={t("Výchozí skupina")}
            description={t("Předvyplní se u nové položky ceníku a nové kliniky (max jedna)")}
            checked={form.isDefault}
            onChange={(e) => setForm((f) => ({ ...f, isDefault: e.currentTarget.checked }))}
          />
        </Stack>
        <Group justify="flex-end" mt="md" gap="sm">
          <Button variant="default" onClick={() => setModalOpen(false)}>
            {t("Zrušit")}
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!form.name.trim()}>
            {editing ? t("Uložit") : t("Přidat")}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
