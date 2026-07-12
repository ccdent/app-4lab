// =============================================================================
// ClinicQuickCreateModal — založení kliniky bez opuštění rozdělané práce
// (typicky z karty nového doktora). Kompakt: identifikace + adresa + kontakt
// + ceníkové skupiny; detaily (barva, poznámka) jdou doplnit později v editaci.
// =============================================================================

import { useEffect, useState } from "react";
import {
  Button,
  Grid,
  Group,
  Modal,
  MultiSelect,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { api } from "../../api/client";
import type { CustomerGroup } from "../../api/types";
import { notifyError, notifySuccess } from "../../lib/notify";

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Zavolá se s id nově založené kliniky — parent refetchne seznam a vybere ji. */
  onCreated: (clinicId: string) => void;
}

interface FormValues {
  companyName: string;
  ico: string;
  street: string;
  city: string;
  zip: string;
  phone: string;
  email: string;
  groupIds: string[];
}

const INITIAL: FormValues = {
  companyName: "",
  ico: "",
  street: "",
  city: "",
  zip: "",
  phone: "",
  email: "",
  groupIds: [],
};

export default function ClinicQuickCreateModal({ opened, onClose, onCreated }: Props) {
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    initialValues: INITIAL,
    validate: {
      companyName: (v) => (v.trim() ? null : "Název je povinný"),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.reset();
    void api
      .get<CustomerGroup[]>("/customer-groups")
      .then((list) => {
        setGroups(list);
        // Předvyplnit výchozí skupinu.
        const def = list.find((g) => g.isDefault);
        if (def) form.setFieldValue("groupIds", [def.id]);
      })
      .catch(() => setGroups([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleSubmit = form.onSubmit(async (values) => {
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>("/clinics", {
        companyName: values.companyName.trim(),
        ico: values.ico.trim(),
        street: values.street.trim(),
        city: values.city.trim(),
        zip: values.zip.trim(),
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        groupIds: values.groupIds,
      });
      notifySuccess("Klinika založena.");
      onCreated(res.id);
      onClose();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Založení kliniky se nepodařilo");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Nová klinika" size="lg">
      <form onSubmit={handleSubmit}>
        <Grid gutter="sm">
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput label="Název kliniky" required data-autofocus {...form.getInputProps("companyName")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="IČO" {...form.getInputProps("ico")} />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput label="Ulice a č.p." {...form.getInputProps("street")} />
          </Grid.Col>
          <Grid.Col span={{ base: 8, sm: 8 }}>
            <TextInput label="Město" {...form.getInputProps("city")} />
          </Grid.Col>
          <Grid.Col span={{ base: 4, sm: 4 }}>
            <TextInput label="PSČ" {...form.getInputProps("zip")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 6 }}>
            <TextInput label="Telefon" {...form.getInputProps("phone")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 6 }}>
            <TextInput label="E-mail" {...form.getInputProps("email")} />
          </Grid.Col>
          <Grid.Col span={12}>
            <MultiSelect
              label="Ceníkové skupiny"
              placeholder={groups.length ? "Vyber skupiny..." : "Zatím žádné skupiny (Ceník → Skupiny)"}
              searchable
              data={groups.map((g) => ({ value: g.id, label: g.name }))}
              {...form.getInputProps("groupIds")}
            />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end" mt="md" gap="sm">
          <Button variant="default" onClick={onClose}>
            Zrušit
          </Button>
          <Button type="submit" loading={saving}>
            Založit kliniku
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
