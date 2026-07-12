import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  ActionIcon,
  Button,
  Card,
  Chip,
  Grid,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconExternalLink, IconPlus } from "@tabler/icons-react";
import { useForm } from "@mantine/form";
import { api } from "../../api/client";
import type { ClinicListRow, DoctorDetail, PreferenceOption } from "../../api/types";
import ClinicQuickCreateModal from "../../components/clinics/ClinicQuickCreateModal";
import FormPageShell from "../../components/ui/FormPageShell";
import { usePerms } from "../../auth/usePerms";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface FormValues {
  clinicId: string;
  titlePrefix: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  note: string;
  preferenceOptionIds: string[];
  isActive: boolean;
}

const INITIAL: FormValues = {
  clinicId: "",
  titlePrefix: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  note: "",
  preferenceOptionIds: [],
  isActive: true,
};

/** NEW (`/app/doctors/new`) i EDIT (`/app/doctors/:id`). */
export default function DoctorFormPage() {
  const perms = usePerms();
  const readOnly = !perms.doctorsEdit;
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [clinics, setClinics] = useState<ClinicListRow[]>([]);
  const [options, setOptions] = useState<PreferenceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clinicModalOpen, setClinicModalOpen] = useState(false);

  // Bez oprávnění nemá /new smysl (prázdný formulář bez uložení).
  useEffect(() => {
    if (readOnly && !isEdit) {
      notifyError(t("Nemáš oprávnění zakládat doktory."));
      navigate("/app/doctors");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Po rychlém založení kliniky: refetch seznamu + rovnou ji vybrat. */
  const handleClinicCreated = async (clinicId: string) => {
    try {
      setClinics(await api.get<ClinicListRow[]>("/clinics"));
    } catch {
      // seznam se nepovedlo obnovit — výběr níže stejně nastavíme
    }
    form.setFieldValue("clinicId", clinicId);
  };

  const form = useForm<FormValues>({
    initialValues: INITIAL,
    validate: {
      clinicId: (v) => (v ? null : t("Klinika je povinná")),
      firstName: (v) => (v.trim() ? null : t("Jméno je povinné")),
      lastName: (v) => (v.trim() ? null : t("Příjmení je povinné")),
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        // includeInactive: doktor může patřit k deaktivované klinice —
        // bez ní by Select ukazoval prázdnou hodnotu, ač klinika nastavená je.
        const [clinicList, optionList] = await Promise.all([
          api.get<ClinicListRow[]>("/clinics?includeInactive=1"),
          api.get<PreferenceOption[]>("/preference-options"),
        ]);
        setOptions(optionList);
        if (id) {
          const d = await api.get<DoctorDetail>(`/doctors/${id}`);
          // Aktivní kliniky + ta doktorova (i neaktivní).
          setClinics(clinicList.filter((c) => c.isActive || c.id === d.clinicId));
          form.setValues({
            clinicId: d.clinicId,
            titlePrefix: d.titlePrefix ?? "",
            firstName: d.firstName,
            lastName: d.lastName,
            email: d.email ?? "",
            phone: d.phone ?? "",
            note: d.note ?? "",
            preferenceOptionIds: d.preferenceOptionIds,
            isActive: d.isActive,
          });
          form.resetDirty();
        } else {
          setClinics(clinicList.filter((c) => c.isActive));
        }
      } catch (err) {
        notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst data"));
        navigate("/app/doctors");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = form.onSubmit(async (values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        titlePrefix: values.titlePrefix || null,
        email: values.email || null,
        phone: values.phone || null,
        note: values.note || null,
      };
      if (isEdit) {
        await api.put(`/doctors/${id}`, payload);
        notifySuccess(t("Doktor uložen."));
      } else {
        await api.post("/doctors", payload);
        notifySuccess(t("Doktor založen."));
      }
      navigate("/app/doctors");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  });

  const togglePreference = (optionId: string) => {
    form.setFieldValue(
      "preferenceOptionIds",
      form.values.preferenceOptionIds.includes(optionId)
        ? form.values.preferenceOptionIds.filter((x) => x !== optionId)
        : [...form.values.preferenceOptionIds, optionId],
    );
  };

  return (
    <FormPageShell
      title={isEdit ? t("Upravit doktora") : t("Nový doktor")}
      backTo="/app/doctors"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          {readOnly && (
            <Alert color="yellow" variant="light">
              {t("Máš oprávnění jen ke čtení — úpravy adresáře povoluje vedoucí v Admin → Technici.")}
            </Alert>
          )}
          <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <Stack gap="lg">
          <Card withBorder>
            <Title order={4} mb="md">{t("Osobní údaje")}</Title>
            <Grid gutter="md">
              <Grid.Col span={{ base: 4, sm: 2 }}>
                <TextInput
                  label={t("Titul")}
                  placeholder={t("MUDr.")}
                  disabled={loading}
                  {...form.getInputProps("titlePrefix")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 8, sm: 5 }}>
                <TextInput label={t("Jméno")} required disabled={loading} {...form.getInputProps("firstName")} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 5 }}>
                <TextInput label={t("Příjmení")} required disabled={loading} {...form.getInputProps("lastName")} />
              </Grid.Col>
              <Grid.Col span={12}>
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <Select
                    label={t("Klinika (fakturační údaje doktora)")}
                    required
                    searchable
                    disabled={loading}
                    style={{ flex: 1 }}
                    data={clinics.map((c) => ({
                      value: c.id,
                      label: c.isActive ? c.companyName : t("{name} (neaktivní)", { name: c.companyName }),
                    }))}
                    placeholder={clinics.length ? t("Vyber kliniku...") : t("Založ kliniku tlačítkem vpravo")}
                    {...form.getInputProps("clinicId")}
                  />
                  {/* Zpřímené workflow: proklik na kartu vybrané kliniky
                      + založení nové kliniky rovnou odsud. */}
                  <Tooltip label={t("Otevřít kartu kliniky")}>
                    <ActionIcon
                      variant="light"
                      size={44}
                      disabled={!form.values.clinicId}
                      onClick={() => navigate(`/app/clinics/${form.values.clinicId}`)}
                    >
                      <IconExternalLink size={18} />
                    </ActionIcon>
                  </Tooltip>
                  {!readOnly && (
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={16} />}
                      onClick={() => setClinicModalOpen(true)}
                    >
                      {t("Nová klinika")}
                    </Button>
                  )}
                </Group>
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 6 }}>
                <TextInput label={t("Telefon")} disabled={loading} {...form.getInputProps("phone")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 6 }}>
                <TextInput label={t("E-mail")} disabled={loading} {...form.getInputProps("email")} />
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Preference")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Co má doktor rád / nerad — zobrazuje se technikům u jeho zakázek. Možnosti se spravují v Doktoři → Preference.")}
            </Text>
            {options.length === 0 ? (
              <Text size="sm" c="dimmed">{t("Zatím žádné možnosti.")}</Text>
            ) : (
              <Group gap="xs">
                {options.map((o) => (
                  <Chip
                    key={o.id}
                    checked={form.values.preferenceOptionIds.includes(o.id)}
                    onChange={() => togglePreference(o.id)}
                    disabled={loading}
                  >
                    {o.label}
                  </Chip>
                ))}
              </Group>
            )}
          </Card>

          <Card withBorder>
            <Title order={4} mb="md">{t("Poznámka")}</Title>
            <Textarea autosize minRows={2} disabled={loading} {...form.getInputProps("note")} />
            {isEdit && (
              <Switch
                mt="md"
                label={t("Aktivní doktor")}
                {...form.getInputProps("isActive", { type: "checkbox" })}
              />
            )}
          </Card>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => navigate("/app/doctors")}>
              {t("Zrušit")}
            </Button>
            {!readOnly && (<Button type="submit" loading={saving} disabled={loading}>
              {isEdit ? t("Uložit změny") : t("Založit doktora")}
            </Button>)}
          </Group>
          </Stack>
          </fieldset>
        </Stack>
      </form>

      <ClinicQuickCreateModal
        opened={clinicModalOpen}
        onClose={() => setClinicModalOpen(false)}
        onCreated={(clinicId) => void handleClinicCreated(clinicId)}
      />
    </FormPageShell>
  );
}
