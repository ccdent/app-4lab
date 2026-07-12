import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  ColorInput,
  Grid,
  Group,
  MultiSelect,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { IconChevronRight, IconPlus } from "@tabler/icons-react";
import { useForm } from "@mantine/form";
import { api } from "../../api/client";
import {
  doctorDisplayName,
  type ClinicDetail,
  type CustomerGroup,
  type DoctorListRow,
} from "../../api/types";
import { Badge, UnstyledButton } from "@mantine/core";
import FormPageShell from "../../components/ui/FormPageShell";
import { usePerms } from "../../auth/usePerms";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface FormValues {
  companyName: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string;
  phone: string;
  email: string;
  contactPersonName: string;
  color: string;
  note: string;
  groupIds: string[];
  isActive: boolean;
}

const INITIAL: FormValues = {
  companyName: "",
  street: "",
  city: "",
  zip: "",
  ico: "",
  dic: "",
  phone: "",
  email: "",
  contactPersonName: "",
  color: "#4FB6B2",
  note: "",
  groupIds: [],
  isActive: true,
};

/** NEW (`/app/clinics/new`) i EDIT (`/app/clinics/:id`) — malá entita adresáře,
 *  editace formulářem je tu záměrně (plný detail model má až zakázka). */
export default function ClinicFormPage() {
  const perms = usePerms();
  const readOnly = !perms.doctorsEdit;
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [clinicDoctors, setClinicDoctors] = useState<DoctorListRow[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Bez oprávnění nemá /new smysl (prázdný formulář bez uložení).
  useEffect(() => {
    if (readOnly && !isEdit) {
      notifyError(t("Nemáš oprávnění zakládat kliniky."));
      navigate("/app/clinics");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<FormValues>({
    initialValues: INITIAL,
    validate: {
      companyName: (v) => (v.trim() ? null : t("Název je povinný")),
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        const groupList = await api.get<CustomerGroup[]>("/customer-groups");
        setGroups(groupList);
        // Nová klinika: předvyplnit výchozí skupinu.
        if (!id) {
          const def = groupList.find((g) => g.isDefault);
          if (def) form.setFieldValue("groupIds", [def.id]);
        }
        if (id) {
          // Doktoři kliniky — pro prokliky na jejich karty.
          void api
            .get<DoctorListRow[]>("/doctors?includeInactive=1")
            .then((all) => setClinicDoctors(all.filter((d) => d.clinicId === id)))
            .catch(() => setClinicDoctors([]));
          const c = await api.get<ClinicDetail>(`/clinics/${id}`);
          form.setValues({
            companyName: c.companyName,
            street: c.street,
            city: c.city,
            zip: c.zip,
            ico: c.ico,
            dic: c.dic ?? "",
            phone: c.phone ?? "",
            email: c.email ?? "",
            contactPersonName: c.contactPersonName ?? "",
            color: c.color,
            note: c.note ?? "",
            groupIds: c.groupIds,
            isActive: c.isActive,
          });
          form.resetDirty();
        }
      } catch (err) {
        notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst data"));
        navigate("/app/clinics");
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
        dic: values.dic || null,
        phone: values.phone || null,
        email: values.email || null,
        contactPersonName: values.contactPersonName || null,
        note: values.note || null,
      };
      if (isEdit) {
        await api.put(`/clinics/${id}`, payload);
        notifySuccess(t("Klinika uložena."));
      } else {
        await api.post("/clinics", payload);
        notifySuccess(t("Klinika založena."));
      }
      navigate("/app/clinics");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  });

  return (
    <FormPageShell
      title={isEdit ? t("Upravit kliniku") : t("Nová klinika")}
      backTo="/app/clinics"
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
            <Title order={4} mb="md">{t("Základní údaje")}</Title>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <TextInput
                  label={t("Název kliniky")}
                  required
                  disabled={loading}
                  {...form.getInputProps("companyName")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <ColorInput label={t("Barva")} disabled={loading} {...form.getInputProps("color")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <TextInput label={t("IČO")} disabled={loading} {...form.getInputProps("ico")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <TextInput label={t("DIČ")} disabled={loading} {...form.getInputProps("dic")} />
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder>
            <Title order={4} mb="md">{t("Adresa")}</Title>
            <Grid gutter="md">
              <Grid.Col span={12}>
                <TextInput label={t("Ulice a č.p.")} disabled={loading} {...form.getInputProps("street")} />
              </Grid.Col>
              <Grid.Col span={{ base: 8, sm: 8 }}>
                <TextInput label={t("Město")} disabled={loading} {...form.getInputProps("city")} />
              </Grid.Col>
              <Grid.Col span={{ base: 4, sm: 4 }}>
                <TextInput label={t("PSČ")} disabled={loading} {...form.getInputProps("zip")} />
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder>
            <Title order={4} mb="md">{t("Kontakt")}</Title>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput
                  label={t("Kontaktní osoba")}
                  disabled={loading}
                  {...form.getInputProps("contactPersonName")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <TextInput label={t("Telefon")} disabled={loading} {...form.getInputProps("phone")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <TextInput label={t("E-mail")} disabled={loading} {...form.getInputProps("email")} />
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Ceníkové skupiny")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Určují, které položky ceníku se nabízejí u zakázek této kliniky.")}
            </Text>
            <MultiSelect
              data={groups.map((g) => ({ value: g.id, label: g.name }))}
              placeholder={groups.length ? t("Vyber skupiny...") : t("Zatím žádné skupiny (založí se v Ceníku)")}
              disabled={loading}
              searchable
              {...form.getInputProps("groupIds")}
            />
          </Card>

          {isEdit && (
            <Card withBorder>
              <Group justify="space-between" mb="sm">
                <Title order={4}>{t("Doktoři kliniky")}</Title>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => navigate("/app/doctors/new")}
                >
                  {t("Nový doktor")}
                </Button>
              </Group>
              {clinicDoctors.length === 0 ? (
                <Text size="sm" c="dimmed">{t("Klinika zatím nemá žádné doktory.")}</Text>
              ) : (
                <Stack gap={4}>
                  {clinicDoctors.map((d) => (
                    <UnstyledButton
                      key={d.id}
                      onClick={() => navigate(`/app/doctors/${d.id}`)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid light-dark(#f3f4f6, #2a2a2a)",
                      }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={600} style={{ color: "light-dark(#161616, #f2f2f2)" }}>
                          {doctorDisplayName(d)}
                        </Text>
                        {!d.isActive && (
                          <Badge size="xs" variant="light" color="gray">{t("Neaktivní")}</Badge>
                        )}
                      </Group>
                      <IconChevronRight size={16} style={{ color: "light-dark(#9ca3af, #7a7a7a)" }} />
                    </UnstyledButton>
                  ))}
                </Stack>
              )}
            </Card>
          )}

          <Card withBorder>
            <Title order={4} mb="md">{t("Poznámka")}</Title>
            <Textarea
              autosize
              minRows={2}
              disabled={loading}
              {...form.getInputProps("note")}
            />
            {isEdit && (
              <Switch
                mt="md"
                label={t("Aktivní klinika")}
                {...form.getInputProps("isActive", { type: "checkbox" })}
              />
            )}
          </Card>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => navigate("/app/clinics")}>
              {t("Zrušit")}
            </Button>
            {!readOnly && (<Button type="submit" loading={saving} disabled={loading}>
              {isEdit ? t("Uložit změny") : t("Založit kliniku")}
            </Button>)}
          </Group>
          </Stack>
          </fieldset>
        </Stack>
      </form>
    </FormPageShell>
  );
}
