import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { api } from "../../../api/client";
import type {
  MaterialCatalogRow,
  PriceListItemRow,
  RecipeDetail,
  RecipeLineType,
} from "../../../api/types";
import FormPageShell from "../../../components/ui/FormPageShell";
import { usePerms } from "../../../auth/usePerms";
import { confirm } from "../../../lib/confirm";
import { notifyError, notifySuccess } from "../../../lib/notify";
import { t } from "../../../i18n";

interface DraftLine {
  id: string | null;
  key: string;
  lineType: RecipeLineType;
  materialCatalogId: string | null;
  placeholderText: string;
  note: string;
}

let lineKeySeq = 0;
const nextLineKey = () => `line-${++lineKeySeq}`;

/** Nový recept / úprava receptu — šablona složení s řádky a vazbou na ceník. */
export default function RecipeFormPage() {
  const perms = usePerms();
  const readOnly = !perms.materialsEdit;
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [archived, setArchived] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [priceListItemIds, setPriceListItemIds] = useState<string[]>([]);

  const [catalog, setCatalog] = useState<MaterialCatalogRow[]>([]);
  const [priceListItems, setPriceListItems] = useState<PriceListItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bez oprávnění nemá /new smysl (prázdný formulář bez uložení).
  useEffect(() => {
    if (readOnly && !isEdit) {
      notifyError(t("Nemáš oprávnění zakládat recepty."));
      navigate("/app/materials/recipes");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [catalogList, pliList] = await Promise.all([
          api.get<MaterialCatalogRow[]>("/material-catalog"),
          api.get<PriceListItemRow[]>("/price-list-items"),
        ]);
        setCatalog(catalogList);
        setPriceListItems(pliList);
        if (id) {
          const detail = await api.get<RecipeDetail>(`/recipes/${id}`);
          setName(detail.name);
          setDescription(detail.description ?? "");
          setArchived(detail.archived);
          setPriceListItemIds(detail.priceListItemIds);
          setLines(
            detail.items.map((l) => ({
              id: l.id,
              key: l.id,
              lineType: l.lineType,
              materialCatalogId: l.materialCatalogId,
              placeholderText: l.placeholderText ?? "",
              note: l.note ?? "",
            })),
          );
        }
      } catch (err) {
        notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst data"));
        navigate("/app/materials/recipes");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: null, key: nextLineKey(), lineType: "catalog_item", materialCatalogId: null, placeholderText: "", note: "" },
    ]);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const moveLine = (key: string, dir: -1 | 1) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const handleSubmit = async () => {
    if (!name.trim()) return notifyError(t("Název je povinný"));
    if (lines.length === 0) return notifyError(t("Recept musí mít aspoň jeden řádek."));
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.lineType === "catalog_item" && !l.materialCatalogId) {
        return notifyError(t("Řádek #{n}: vyber katalogovou položku.", { n: i + 1 }));
      }
      if (l.lineType === "placeholder" && !l.placeholderText.trim()) {
        return notifyError(t("Řádek #{n}: zadej text placeholderu.", { n: i + 1 }));
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        archived,
        items: lines.map((l, idx) => ({
          id: l.id,
          lineType: l.lineType,
          materialCatalogId: l.lineType === "catalog_item" ? l.materialCatalogId : null,
          placeholderText: l.lineType === "placeholder" ? l.placeholderText.trim() : null,
          note: l.note.trim() || null,
          sortOrder: idx,
        })),
        priceListItemIds,
      };
      if (isEdit) {
        await api.put(`/recipes/${id}`, payload);
        notifySuccess(t("Recept uložen."));
      } else {
        await api.post("/recipes", payload);
        notifySuccess(t("Recept vytvořen."));
      }
      navigate("/app/materials/recipes");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: t("Smazat recept"),
      message: t('Trvale smazat recept "{name}"? Tato akce je nevratná. Existující návrhy v zakázkách zůstanou čitelné díky snapshotům, ale ztratí vazbu na šablonu.', { name }),
      confirmLabel: t("Smazat"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/recipes/${id}`);
      notifySuccess(t("Recept byl smazán."));
      navigate("/app/materials/recipes");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Smazání se nepodařilo"));
    }
  };

  return (
    <FormPageShell
      title={isEdit ? t("Úprava receptu") : t("Nový recept")}
      backTo="/app/materials/recipes"
    >
      <Stack gap="lg">
        {readOnly && (
          <Alert color="yellow" variant="light">
            {t("Máš oprávnění jen ke čtení — úpravy materiálů povoluje vedoucí v Admin → Technici.")}
          </Alert>
        )}
        <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <Stack gap="lg">
        <Card withBorder>
          <Title order={4} mb="md">{t("Identifikace")}</Title>
          <Stack gap="md">
            <TextInput
              label={t("Název")}
              required
              placeholder={t('Např. "Zirkonová korunka — standardní"')}
              disabled={loading}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Textarea
              label={t("Popis (volitelné)")}
              autosize
              minRows={2}
              disabled={loading}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
          </Stack>
        </Card>

        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Title order={4}>{t("Řádky receptu")}</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            {t("Recept je šablona — řádky se v zakázce uloží jako návrh, který technik ručně potvrdí.")}
          </Text>
          {lines.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("Recept zatím nemá žádné řádky. Přidej alespoň jeden řádek tlačítkem níže.")}
            </Text>
          ) : (
            <Stack gap={10}>
              {lines.map((l, idx) => (
                <Box
                  key={l.key}
                  p="sm"
                  style={{ backgroundColor: "light-dark(#f9fafb, #191919)", border: "1px solid light-dark(#e5e7eb, #333333)", borderRadius: 8 }}
                >
                  <Group justify="space-between" mb={8} wrap="nowrap">
                    <Group gap={8} wrap="nowrap">
                      <Text size="sm" fw={600} c="dimmed">#{idx + 1}</Text>
                      <Select
                        size="xs"
                        w={190}
                        value={l.lineType}
                        onChange={(v) =>
                          updateLine(l.key, {
                            lineType: (v ?? "catalog_item") as RecipeLineType,
                          })
                        }
                        data={[
                          { value: "catalog_item", label: t("Konkrétní materiál") },
                          { value: "placeholder", label: t("Placeholder") },
                        ]}
                      />
                    </Group>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon variant="subtle" color="gray" disabled={idx === 0} onClick={() => moveLine(l.key, -1)}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        disabled={idx === lines.length - 1}
                        onClick={() => moveLine(l.key, 1)}
                      >
                        <IconArrowDown size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => removeLine(l.key)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  {l.lineType === "catalog_item" ? (
                    <Select
                      label={t("Katalogová položka")}
                      searchable
                      placeholder={t("Hledat kód, název, výrobce…")}
                      nothingFoundMessage={t("Nenalezeno")}
                      data={catalog
                        .filter((cItem) => cItem.isActive)
                        .map((cItem) => ({
                          value: cItem.id,
                          label: `${cItem.code} — ${cItem.canonicalName} (${cItem.manufacturerName})`,
                        }))}
                      value={l.materialCatalogId}
                      onChange={(v) => updateLine(l.key, { materialCatalogId: v })}
                    />
                  ) : (
                    <TextInput
                      label={t("Text placeholderu")}
                      description={t("Hint pro technika — co má vybrat při vyřešení návrhu.")}
                      placeholder={t('Např. "zirkonový disk", "PMMA disk"')}
                      value={l.placeholderText}
                      onChange={(e) => updateLine(l.key, { placeholderText: e.currentTarget.value })}
                    />
                  )}
                  <Textarea
                    label={t("Poznámka (volitelné)")}
                    autosize
                    minRows={1}
                    mt={8}
                    value={l.note}
                    onChange={(e) => updateLine(l.key, { note: e.currentTarget.value })}
                  />
                </Box>
              ))}
            </Stack>
          )}
          <Button mt="md" variant="light" leftSection={<IconPlus size={14} />} onClick={addLine}>
            {t("Přidat řádek")}
          </Button>
        </Card>

        <Card withBorder>
          <Title order={4} mb="xs">{t("Přiřazené položky ceníku")}</Title>
          <Text size="sm" c="dimmed" mb="md">
            {t("Recept se navrhne do zakázky, jakmile zakázka obsahuje některou z těchto položek.")}
          </Text>
          <MultiSelect
            searchable
            placeholder={t("Vyber položky ceníku…")}
            nothingFoundMessage={t("Nenalezeno")}
            disabled={loading}
            data={priceListItems.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            value={priceListItemIds}
            onChange={setPriceListItemIds}
          />
        </Card>

        </Stack>
        </fieldset>
        <Group justify="space-between">
          <Group gap="sm">
            {isEdit && !readOnly && (
              <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={() => void handleDelete()}>
                {t("Smazat")}
              </Button>
            )}
          </Group>
          <Group gap="sm">
            <Button variant="default" onClick={() => navigate("/app/materials/recipes")}>
              {t("Zrušit")}
            </Button>
            {!readOnly && (
              <Button
                loading={saving}
                disabled={loading}
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={() => void handleSubmit()}
              >
                {isEdit ? t("Uložit změny") : t("Vytvořit recept")}
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </FormPageShell>
  );
}
