import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Anchor,
  Button,
  Card,
  Chip,
  Grid,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { api, ApiError } from "../../api/client";
import type {
  CustomerGroup,
  PriceListCategory,
  PriceListItemDetail,
  PriceListItemKind,
  RecipeListRow,
  SingleIndication,
} from "../../api/types";
import { halereToKc, kcToHalere } from "../../shared/money";
import FormPageShell from "../../components/ui/FormPageShell";
import { usePerms } from "../../auth/usePerms";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface FormValues {
  code: string;
  name: string;
  shortName: string;
  categoryId: string;
  groupId: string;
  mdrDevice: boolean;
  /** "" = běžná položka. */
  kind: "" | PriceListItemKind;
  singleIndications: SingleIndication[];
  bridgeStumpKc: number | string;
  bridgePonticKc: number | string;
  bridgeImplantKc: number | string;
  priceKc: number | string;
  technicianFeeKc: number | string;
  productionDays: number | string;
  archived: boolean;
}

const INITIAL: FormValues = {
  code: "",
  name: "",
  shortName: "",
  categoryId: "",
  groupId: "",
  // Default typ je pomocná položka → není ZP (přepne se s výběrem typu).
  mdrDevice: false,
  kind: "",
  singleIndications: [],
  bridgeStumpKc: "",
  bridgePonticKc: "",
  bridgeImplantKc: "",
  priceKc: "",
  technicianFeeKc: 0,
  productionDays: "",
  archived: false,
};

// Klíče jsou české zdrojové texty — překlad se dosadí přes t() až při renderu.
const INDICATION_LABEL: Record<SingleIndication, string> = {
  STUMP: "Samostatný pahýl",
  PONTIC: "Samostatný mezičlen",
  IMPLANT: "Samostatný implantát",
};

export default function PriceListItemFormPage() {
  const perms = usePerms();
  const readOnly = !perms.priceListEdit;
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [categories, setCategories] = useState<PriceListCategory[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [recipes, setRecipes] = useState<RecipeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bez oprávnění nemá /new smysl (prázdný formulář bez uložení).
  useEffect(() => {
    if (readOnly && !isEdit) {
      notifyError(t("Nemáš oprávnění zakládat položky ceníku."));
      navigate("/app/price-list");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read-only: recepty navázané na tuto položku (best-effort).
  useEffect(() => {
    if (!id) return;
    void api
      .get<RecipeListRow[]>(`/recipes?priceListItemId=${id}`)
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, [id]);

  const form = useForm<FormValues>({
    initialValues: INITIAL,
    validate: {
      code: (v) => (v.trim() ? null : t("Kód je povinný")),
      name: (v) => (v.trim() ? null : t("Název je povinný")),
      shortName: (v) => (v.trim() ? null : t("Zkrácený název je povinný")),
      categoryId: (v) => (v ? null : t("Kategorie je povinná")),
      priceKc: (v, values) =>
        values.kind === "bridge" ? null : v === "" || Number(v) < 0 ? t("Cena musí být >= 0") : null,
      singleIndications: (v, values) =>
        values.kind === "single" && v.length === 0 ? t("Vyber aspoň jednu indikaci") : null,
      bridgeStumpKc: (v, values) =>
        values.kind === "bridge" && v === "" ? t("Cena za pahýl je povinná") : null,
      bridgePonticKc: (v, values) =>
        values.kind === "bridge" && v === "" ? t("Cena za mezičlen je povinná") : null,
      bridgeImplantKc: (v, values) =>
        values.kind === "bridge" && v === "" ? t("Cena za implantát je povinná") : null,
      productionDays: (v) =>
        v !== "" && !Number.isInteger(Number(v)) ? t("Počet dní musí být celé číslo") : null,
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        const [catList, groupList] = await Promise.all([
          api.get<PriceListCategory[]>("/price-list-categories"),
          api.get<CustomerGroup[]>("/customer-groups"),
        ]);
        setCategories(catList);
        setGroups(groupList);
        // Nová položka: předvyplnit výchozí skupinu.
        if (!id) {
          const def = groupList.find((g) => g.isDefault);
          if (def) form.setFieldValue("groupId", def.id);
        }
        if (id) {
          const item = await api.get<PriceListItemDetail>(`/price-list-items/${id}`);
          form.setValues({
            code: item.code,
            name: item.name,
            shortName: item.shortName,
            categoryId: item.categoryId,
            groupId: item.groupId ?? "",
            mdrDevice: item.mdrDevice,
            kind: item.kind ?? "",
            singleIndications: item.singleIndications,
            bridgeStumpKc: item.bridgeStumpPrice != null ? halereToKc(item.bridgeStumpPrice) : "",
            bridgePonticKc: item.bridgePonticPrice != null ? halereToKc(item.bridgePonticPrice) : "",
            bridgeImplantKc: item.bridgeImplantPrice != null ? halereToKc(item.bridgeImplantPrice) : "",
            priceKc: halereToKc(item.price),
            technicianFeeKc: halereToKc(item.technicianFee),
            productionDays: item.productionDays ?? "",
            archived: item.archived,
          });
          form.resetDirty();
        }
      } catch (err) {
        notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst data"));
        navigate("/app/price-list");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const kind = form.values.kind;
  // 4 volby se na mobil nevejdou vedle sebe → vertikální varianta.
  const isMobile = useMediaQuery("(max-width: 47.99em)") ?? false;

  const handleSubmit = form.onSubmit(async (values) => {
    setSaving(true);
    try {
      const toHal = (v: number | string) => (v === "" ? null : kcToHalere(Number(v)));
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        shortName: values.shortName.trim(),
        categoryId: values.categoryId,
        groupId: values.groupId || null,
        mdrDevice: values.mdrDevice,
        kind: values.kind || null,
        singleIndications: values.kind === "single" ? values.singleIndications : [],
        bridgeStumpPrice: values.kind === "bridge" ? toHal(values.bridgeStumpKc) : null,
        bridgePonticPrice: values.kind === "bridge" ? toHal(values.bridgePonticKc) : null,
        bridgeImplantPrice: values.kind === "bridge" ? toHal(values.bridgeImplantKc) : null,
        price: values.kind === "bridge" ? 0 : kcToHalere(Number(values.priceKc) || 0),
        technicianFee: kcToHalere(Number(values.technicianFeeKc) || 0),
        productionDays: values.productionDays === "" ? null : Number(values.productionDays),
        archived: values.archived,
      };
      if (isEdit) {
        await api.put(`/price-list-items/${id}`, payload);
        notifySuccess(t("Položka uložena."));
      } else {
        await api.post("/price-list-items", payload);
        notifySuccess(t("Položka založena."));
      }
      navigate("/app/price-list");
    } catch (err) {
      notifyError(
        err instanceof ApiError && err.code === "CODE_TAKEN"
          ? err.message
          : err instanceof Error
            ? err.message
            : t("Uložení se nepodařilo"),
      );
    } finally {
      setSaving(false);
    }
  });

  return (
    <FormPageShell
      title={isEdit ? t("Upravit položku ceníku") : t("Nová položka ceníku")}
      backTo="/app/price-list"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          {readOnly && (
            <Alert color="yellow" variant="light">
              {t("Máš oprávnění jen ke čtení — úpravy ceníku povoluje vedoucí v Admin → Technici.")}
            </Alert>
          )}
          <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <Stack gap="lg">
          <Card withBorder>
            <Title order={4} mb="md">{t("Identifikace")}</Title>
            <Grid gutter="md">
              <Grid.Col span={{ base: 4, sm: 3 }}>
                <TextInput label={t("Kód")} required disabled={loading} {...form.getInputProps("code")} />
              </Grid.Col>
              <Grid.Col span={{ base: 8, sm: 9 }}>
                <TextInput label={t("Název")} required disabled={loading} {...form.getInputProps("name")} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label={t("Zkrácený název")}
                  placeholder={t("Pro štítky a tabulky")}
                  required
                  disabled={loading}
                  {...form.getInputProps("shortName")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Select
                  label={t("Kategorie")}
                  required
                  searchable
                  disabled={loading}
                  data={categories.map((c) => ({ value: c.id, label: c.name }))}
                  {...form.getInputProps("categoryId")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Select
                  label={t("Skupina")}
                  placeholder={t("Bez skupiny = mimo picker")}
                  searchable
                  clearable
                  disabled={loading}
                  data={groups.map((g) => ({ value: g.id, label: g.name }))}
                  {...form.getInputProps("groupId")}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <Switch
                  label={t("Zdravotnický prostředek dle MDR")}
                  description={
                    kind === ""
                      ? t("Pomocná položka (bez vazby na zuby) nemůže být ZP")
                      : t("ZP se tisknou na štítek zásilky a prohlášení o shodě se sériovým číslem")
                  }
                  disabled={loading || kind === ""}
                  {...form.getInputProps("mdrDevice", { type: "checkbox" })}
                />
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Vazba na mapu zubů")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Určuje, kdy se položka nabídne u zakázky a jak vznikne lokalizace (sériové číslo = číslo zakázky/lokalizace).")}
            </Text>
            <SegmentedControl
              fullWidth
              orientation={isMobile ? "vertical" : "horizontal"}
              disabled={loading}
              value={kind}
              onChange={(v) => {
                const next = v as FormValues["kind"];
                const prev = form.values.kind;
                form.setFieldValue("kind", next);
                // Pomocná položka nemůže být ZP; přechod z pomocné na zubní
                // typ → default ZP. Přepnutí MEZI zubními typy ručně
                // nastavený příznak nemění.
                if (next === "") form.setFieldValue("mdrDevice", false);
                else if (prev === "") form.setFieldValue("mdrDevice", true);
              }}
              data={[
                { value: "", label: t("Pomocná položka") },
                { value: "single", label: t("Samostatný člen - korunka") },
                { value: "bridge", label: t("Spojené členy - můstek") },
                { value: "arch", label: t("Celá čelist - CSN, fólie…") },
              ]}
            />
            {kind === "single" && (
              <>
                <Text size="sm" fw={500} mt="md" mb={6} c="light-dark(#374151, #cfcfcf)">
                  {t("Indikace — pro které stavy zubu se položka nabízí")}
                </Text>
                <Group gap="xs">
                  {(Object.keys(INDICATION_LABEL) as SingleIndication[]).map((ind) => (
                    <Chip
                      key={ind}
                      checked={form.values.singleIndications.includes(ind)}
                      onChange={() =>
                        form.setFieldValue(
                          "singleIndications",
                          form.values.singleIndications.includes(ind)
                            ? form.values.singleIndications.filter((x) => x !== ind)
                            : [...form.values.singleIndications, ind],
                        )
                      }
                    >
                      {t(INDICATION_LABEL[ind])}
                    </Chip>
                  ))}
                </Group>
                {form.errors.singleIndications && (
                  <Text size="xs" c="red" mt={4}>{form.errors.singleIndications}</Text>
                )}
              </>
            )}
            {kind === "bridge" && (
              <Grid gutter="md" mt="md">
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <NumberInput
                    label={t("Cena za člen — pahýl (Kč)")}
                    min={0}
                    decimalScale={2}
                    disabled={loading}
                    {...form.getInputProps("bridgeStumpKc")}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <NumberInput
                    label={t("Cena za člen — mezičlen (Kč)")}
                    min={0}
                    decimalScale={2}
                    disabled={loading}
                    {...form.getInputProps("bridgePonticKc")}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <NumberInput
                    label={t("Cena za člen — implantát (Kč)")}
                    min={0}
                    decimalScale={2}
                    disabled={loading}
                    {...form.getInputProps("bridgeImplantKc")}
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Text size="xs" c="dimmed">
                    {t("Cena můstku na zakázce = součet členů podle stavů zubů v mapě.")}
                  </Text>
                </Grid.Col>
              </Grid>
            )}
          </Card>

          <Card withBorder>
            <Title order={4} mb="md">{t("Cena")}</Title>
            <Grid gutter="md">
              {kind !== "bridge" && (
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <NumberInput
                    label={t("Cena (Kč)")}
                    required
                    min={0}
                    decimalScale={2}
                    disabled={loading}
                    {...form.getInputProps("priceKc")}
                  />
                </Grid.Col>
              )}
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <NumberInput
                  label={t("Odměna technika (Kč)")}
                  min={0}
                  decimalScale={2}
                  disabled={loading}
                  {...form.getInputProps("technicianFeeKc")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <NumberInput
                  label={t("Výroba (dny)")}
                  min={0}
                  allowDecimal={false}
                  disabled={loading}
                  {...form.getInputProps("productionDays")}
                />
              </Grid.Col>
            </Grid>
            {isEdit && (
              <>
                <Switch
                  mt="md"
                  label={t("Archivovaná položka")}
                  {...form.getInputProps("archived", { type: "checkbox" })}
                />
                <Text size="xs" c="dimmed" mt={4}>
                  {t("Archivovaná položka zmizí z ceníku i pickeru; její kód lze znovu použít.")}
                </Text>
              </>
            )}
          </Card>

          {isEdit && recipes.length > 0 && (
            <Card withBorder>
              <Title order={4} mb="xs">{t("Recepty")}</Title>
              <Text size="sm" c="dimmed" mb="sm">
                {t("Recepty materiálového složení navázané na tuto položku (spravují se v Materiály → Recepty).")}
              </Text>
              <Stack gap={4}>
                {recipes.map((r) => (
                  <Anchor
                    key={r.id}
                    size="sm"
                    onClick={() => navigate(`/app/materials/recipes/${r.id}`)}
                  >
                    {r.name}
                  </Anchor>
                ))}
              </Stack>
            </Card>
          )}

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => navigate("/app/price-list")}>
              {t("Zrušit")}
            </Button>
            {!readOnly && (<Button type="submit" loading={saving} disabled={loading}>
              {isEdit ? t("Uložit změny") : t("Založit položku")}
            </Button>)}
          </Group>
          </Stack>
          </fieldset>
        </Stack>
      </form>
    </FormPageShell>
  );
}
