import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Center, Group, Loader, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { api } from "../../api/client";
import type { InstructionDetail } from "../../api/types";
import FormPageShell from "../../components/ui/FormPageShell";
import InstructionRichEditor from "../../components/admin/InstructionRichEditor";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

const CARD = {
  backgroundColor: "light-dark(#ffffff, #1f1f1f)",
  border: "1px solid light-dark(#e5e7eb, #333333)",
  borderRadius: 8,
  padding: 24,
} as const;

/** Admin → Návody → nový / editace. Obsah = HTML z Tiptap editoru. */
export default function InstructionFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;

  const [name, setName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    void api
      .get<InstructionDetail>(`/instructions/${id}`)
      .then((d) => {
        setName(d.name);
        setHtmlContent(d.htmlContent);
        setArchived(d.archived);
      })
      .catch((err) => {
        notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst návod"));
        // Prázdný editovatelný formulář by při uložení přepsal obsah návodu.
        navigate("/app/admin/instructions");
      })
      .finally(() => setLoading(false));
  }, [id, isNew, navigate]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      notifyError(t("Název je povinný"));
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), htmlContent, archived };
      if (isNew) {
        await api.post("/instructions", payload);
        notifySuccess(t("Návod vytvořen"));
      } else {
        await api.put(`/instructions/${id}`, payload);
        notifySuccess(t("Návod uložen"));
      }
      navigate("/app/admin/instructions");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se uložit"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Center h={300}>
        <Loader size="lg" color="teal" />
      </Center>
    );
  }

  return (
    <FormPageShell
      title={isNew ? t("Nový návod") : t("Upravit návod")}
      backTo="/app/admin/instructions"
    >
      <Box style={CARD}>
        <Text fw={600} size="lg" mb="md" style={{ color: "light-dark(#111827, #ececec)" }}>
          {t("Obsah")}
        </Text>
        <Stack gap="md">
          <TextInput
            label={t("Název návodu")}
            placeholder={t("Např. Péče o zirkonový můstek")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            disabled={saving}
            required
          />
          <Box>
            <Text size="sm" fw={500} mb={6}>
              {t("Obsah návodu")}
            </Text>
            <InstructionRichEditor
              value={htmlContent}
              onChange={setHtmlContent}
              disabled={saving}
            />
          </Box>
        </Stack>
      </Box>

      <Box style={CARD}>
        <Text fw={600} size="lg" mb="md" style={{ color: "light-dark(#111827, #ececec)" }}>
          {t("Nastavení")}
        </Text>
        <Switch
          label={t("Archivovaný")}
          description={t("Archivované návody se netisknou v prohlášení")}
          checked={archived}
          onChange={(e) => setArchived(e.currentTarget.checked)}
          disabled={saving}
        />
      </Box>

      <Group justify="flex-end">
        <Button
          variant="default"
          onClick={() => navigate("/app/admin/instructions")}
          disabled={saving}
        >
          {t("Zrušit")}
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          loading={saving}
          leftSection={<IconDeviceFloppy size={16} />}
        >
          {isNew ? t("Vytvořit návod") : t("Uložit změny")}
        </Button>
      </Group>
    </FormPageShell>
  );
}
