import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconLockOpen, IconPencil } from "@tabler/icons-react";
import { api, ApiError } from "../../api/client";
import type { TechnicianRow } from "../../api/types";
import PageHeader from "../../components/ui/PageHeader";
import DataTable from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { useAuth } from "../../auth/authContext";
import { confirm } from "../../lib/confirm";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface FormState {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: "technician" | "lead";
  permOrdersViewAll: boolean;
  permOrdersCreateForOthers: boolean;
  permDoctorsEdit: boolean;
  permPriceListEdit: boolean;
  permMaterialsEdit: boolean;
  isActive: boolean;
}

const EMPTY: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  role: "technician",
  permOrdersViewAll: true,
  permOrdersCreateForOthers: true,
  permDoctorsEdit: true,
  permPriceListEdit: true,
  permMaterialsEdit: true,
  isActive: true,
};

/** Správa techniků. Účet = řádek tady + e-mail v Cloudflare Access policy. */
export default function TechniciansPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<TechnicianRow[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TechnicianRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Sekvence proti stale odpovědi při rychlém přepínání filtru.
  const fetchSeq = useRef(0);
  const fetchData = useCallback(async (includeInactive: boolean) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const rows = await api.get<TechnicianRow[]>(
        `/technicians${includeInactive ? "?includeInactive=1" : ""}`,
      );
      if (seq === fetchSeq.current) setRows(rows);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst techniky"));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(showInactive);
  }, [fetchData, showInactive]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (t: TechnicianRow) => {
    setEditing(t);
    setForm({
      email: t.email,
      firstName: t.firstName,
      lastName: t.lastName,
      phone: t.phone ?? "",
      role: t.role,
      permOrdersViewAll: t.permOrdersViewAll,
      permOrdersCreateForOthers: t.permOrdersCreateForOthers,
      permDoctorsEdit: t.permDoctorsEdit,
      permPriceListEdit: t.permPriceListEdit,
      permMaterialsEdit: t.permMaterialsEdit,
      isActive: t.isActive,
    });
    setModalOpen(true);
  };

  const resetPayrollPassword = async (tech: TechnicianRow) => {
    const ok = await confirm({
      title: t("Smazat heslo vyúčtování"),
      message: t("Smazat heslo vyúčtování technika {name}? Při dalším přístupu do Vyúčtování si zvolí nové.", { name: `${tech.firstName} ${tech.lastName}` }),
      confirmLabel: t("Smazat heslo"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/technicians/${tech.id}/payroll-password`);
      notifySuccess(t("Heslo smazáno — technik si zvolí nové."));
      void fetchData(showInactive);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Smazání se nepodařilo"));
    }
  };

  const valid = form.email.trim() && form.firstName.trim() && form.lastName.trim();

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        permOrdersViewAll: form.permOrdersViewAll,
        permOrdersCreateForOthers: form.permOrdersCreateForOthers,
        permDoctorsEdit: form.permDoctorsEdit,
        permPriceListEdit: form.permPriceListEdit,
        permMaterialsEdit: form.permMaterialsEdit,
        isActive: form.isActive,
      };
      type SaveRes = { id: string; accessSync: { ok: boolean; error?: string } | null };
      if (editing) {
        const res = await api.put<SaveRes>(`/technicians/${editing.id}`, payload);
        if (res.accessSync && !res.accessSync.ok) {
          notifyError(
            t("Technik uložen, ale synchronizace přístupu (Cloudflare Access) selhala: {error} — uprav policy ručně, nebo ulož znovu.", { error: res.accessSync.error ?? "" }),
          );
        } else {
          notifySuccess(t("Technik uložen. Přístup (Cloudflare Access) synchronizován."));
        }
      } else {
        const res = await api.post<SaveRes>("/technicians", payload);
        if (res.accessSync && !res.accessSync.ok) {
          notifyError(
            t("Technik založen, ale synchronizace přístupu (Cloudflare Access) selhala: {error} — přidej e-mail do policy ručně, nebo ulož technika znovu.", { error: res.accessSync.error ?? "" }),
          );
        } else {
          notifySuccess(t("Technik založen. Přístup (Cloudflare Access) je zřízený automaticky."));
        }
      }
      setModalOpen(false);
      void fetchData(showInactive);
    } catch (err) {
      notifyError(
        err instanceof ApiError && err.code === "EMAIL_TAKEN"
          ? err.message
          : t("Uložení se nepodařilo"),
      );
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: t("Technik"),
      primary: true,
      render: (tech: TechnicianRow) => (
        <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>
          {tech.firstName} {tech.lastName}
        </Text>
      ),
    },
    {
      key: "email",
      header: t("E-mail (Access login)"),
      width: "28%",
      render: (tech: TechnicianRow) => <Text size="sm" c="dimmed">{tech.email}</Text>,
    },
    {
      key: "phone",
      header: t("Telefon"),
      width: "16%",
      mobileHidden: true,
      render: (tech: TechnicianRow) => <Text size="sm" c="dimmed">{tech.phone ?? "—"}</Text>,
    },
    {
      key: "role",
      header: t("Role"),
      width: "12%",
      render: (tech: TechnicianRow) => (
        <Badge size="sm" variant={tech.role === "lead" ? "filled" : "light"} color="teal">
          {tech.role === "lead" ? t("Vedoucí") : t("Technik")}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("Stav"),
      width: "12%",
      render: (tech: TechnicianRow) => (
        <Badge size="sm" variant="light" color={tech.isActive ? "green" : "gray"}>
          {tech.isActive ? t("Aktivní") : t("Neaktivní")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "8%",
      align: "right" as const,
      render: (tech: TechnicianRow) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          {me.role === "lead" && tech.hasPayrollPassword === 1 && (
            <Tooltip label={t("Smazat heslo vyúčtování (technik si zvolí nové)")}>
              <ActionIcon
                variant="subtle"
                color="orange"
                size="sm"
                onClick={() => void resetPayrollPassword(tech)}
              >
                <IconLockOpen size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={t("Upravit")}>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => openEdit(tech)}>
              <IconPencil size={18} />
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
            title={t("Technici")}
            count={rows.length}
            primaryAction={{ label: t("Nový technik"), onClick: openNew }}
            secondaryActions={
              <Checkbox
                label={t("Zobrazit neaktivní")}
                checked={showInactive}
                onChange={(e) => setShowInactive(e.currentTarget.checked)}
                size="xs"
              />
            }
          />
          <DataTable
            variant="card"
            columns={columns}
            data={rows}
            loading={loading}
            emptyMessage={t("Žádní technici.")}
            getRowKey={(t) => t.id}
          />
        </Box>
      </Box>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Upravit technika") : t("Nový technik")}
      >
        <Stack gap="sm">
          <TextInput
            label={t("E-mail")}
            description={t("Musí odpovídat e-mailu v Cloudflare Access")}
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.currentTarget.value }))}
          />
          <Group grow>
            <TextInput
              label={t("Jméno")}
              required
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.currentTarget.value }))}
            />
            <TextInput
              label={t("Příjmení")}
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.currentTarget.value }))}
            />
          </Group>
          <TextInput
            label={t("Telefon")}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.currentTarget.value }))}
          />
          <Select
            label={t("Role")}
            description={me.role === "lead" ? t("Vedoucí vidí ve Vyúčtování všechny techniky.") : t("Roli může měnit jen vedoucí.")}
            disabled={me.role !== "lead"}
            data={[
              { value: "technician", label: t("Technik") },
              { value: "lead", label: t("Vedoucí") },
            ]}
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: (v ?? "technician") as FormState["role"] }))}
          />
          {form.role === "technician" && (
            <>
              <Divider label={t("Oprávnění")} labelPosition="left" my={4} />
              <Switch
                label={t("Vidí zakázky ostatních")}
                description={t("Vypnuto: vidí a upravuje jen své a nepřiřazené zakázky.")}
                checked={form.permOrdersViewAll}
                onChange={(e) => setForm((f) => ({ ...f, permOrdersViewAll: e.currentTarget.checked }))}
              />
              <Switch
                label={t("Zadává zakázky i za ostatní")}
                description={t("Vypnuto: nová zakázka jde vždy na něj.")}
                checked={form.permOrdersCreateForOthers}
                onChange={(e) => setForm((f) => ({ ...f, permOrdersCreateForOthers: e.currentTarget.checked }))}
              />
              <Switch
                label={t("Upravuje doktory a kliniky")}
                description={t("Vypnuto: sekce Doktoři (vč. klinik a preferencí) jen ke čtení.")}
                checked={form.permDoctorsEdit}
                onChange={(e) => setForm((f) => ({ ...f, permDoctorsEdit: e.currentTarget.checked }))}
              />
              <Switch
                label={t("Upravuje ceník")}
                description={t("Vypnuto: ceník, kategorie a skupiny jen ke čtení.")}
                checked={form.permPriceListEdit}
                onChange={(e) => setForm((f) => ({ ...f, permPriceListEdit: e.currentTarget.checked }))}
              />
              <Switch
                label={t("Upravuje materiály")}
                description={t("Vypnuto: sklad, katalog a recepty jen ke čtení (zápis na zakázku zůstává).")}
                checked={form.permMaterialsEdit}
                onChange={(e) => setForm((f) => ({ ...f, permMaterialsEdit: e.currentTarget.checked }))}
              />
            </>
          )}
          {editing && (
            <Switch
              label={t("Aktivní technik")}
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.currentTarget.checked }))}
            />
          )}
        </Stack>
        <Group justify="flex-end" mt="md" gap="sm">
          <Button variant="default" onClick={() => setModalOpen(false)}>
            {t("Zrušit")}
          </Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!valid}>
            {editing ? t("Uložit") : t("Založit")}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
