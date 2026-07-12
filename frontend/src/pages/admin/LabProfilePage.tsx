import { useEffect, useState } from "react";
import {
  FileButton,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Progress,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { api } from "../../api/client";
import FormPageShell from "../../components/ui/FormPageShell";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

interface FormValues {
  name: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string;
  phone: string;
  email: string;
  orderPrefixMode: "year" | "custom";
  orderPrefix: string;
  enforceMaterialProposalsOnDone: boolean;
  printInAppLanguage: boolean;
}

const R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Údaje laboratoře — hlavičky tiskových dokumentů (štítek, DL, prohlášení). */
export default function LabProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [logoTs, setLogoTs] = useState<number | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const form = useForm<FormValues>({
    initialValues: { name: "", street: "", city: "", zip: "", ico: "", dic: "", phone: "", email: "", orderPrefixMode: "year" as const, orderPrefix: "", enforceMaterialProposalsOnDone: false, printInAppLanguage: true },
    validate: {
      name: (v) => (v.trim() ? null : t("Název je povinný")),
      orderPrefix: (v, values) => {
        if (values.orderPrefixMode !== "custom") return null;
        if (!v.trim()) return t("Zadej prefix");
        if (!/^[A-Za-z0-9./-]*$/.test(v.trim())) return t("Jen písmena, číslice a . / -");
        return null;
      },
    },
  });

  useEffect(() => {
    void api
      .get<Record<string, string | null>>("/lab-profile")
      .then((p) => {
        form.setValues({
          name: p.name ?? "",
          street: p.street ?? "",
          city: p.city ?? "",
          zip: p.zip ?? "",
          ico: p.ico ?? "",
          dic: p.dic ?? "",
          phone: p.phone ?? "",
          email: p.email ?? "",
          orderPrefixMode: (p.orderPrefixMode === "custom" ? "custom" : "year") as "year" | "custom",
          orderPrefix: p.orderPrefix ?? "",
          enforceMaterialProposalsOnDone: Boolean(p.enforceMaterialProposalsOnDone),
          printInAppLanguage: p.printInAppLanguage == null ? true : Boolean(p.printInAppLanguage),
        });
        setLogoTs((p as unknown as { logoUpdatedAt?: number | null }).logoUpdatedAt ?? null);
        form.resetDirty();
      })
      .catch(() => notifyError(t("Nepodařilo se načíst profil laboratoře")))
      .finally(() => setLoading(false));
    void api
      .get<{ count: number; bytes: number }>("/attachments-usage")
      .then(setUsage)
      .catch(() => setUsage(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = form.onSubmit(async (values) => {
    setSaving(true);
    try {
      await api.put("/lab-profile", {
        ...values,
        dic: values.dic || null,
        phone: values.phone || null,
        email: values.email || null,
      });
      notifySuccess(t("Profil laboratoře uložen."));
      form.resetDirty();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  });

  const [exporting, setExporting] = useState(false);
  const downloadBackup = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/db-export");
      const ct = res.headers.get("Content-Type") ?? "";
      if (!res.ok || !ct.includes("application/sql")) {
        throw new Error(t("Export se nepodařil — obnov stránku a zkus znovu."));
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `zaloha-4lab-${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      URL.revokeObjectURL(a.href);
      notifySuccess(t("Záloha stažena."));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Export se nepodařil — obnov stránku a zkus znovu."));
    } finally {
      setExporting(false);
    }
  };

  const uploadLogo = async (file: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/lab-profile/logo", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { logoUpdatedAt?: number; error?: { message?: string } }
        | null;
      // Vypršelá Access session vrací HTML 200 → json() selže → data null.
      if (!res.ok || data?.logoUpdatedAt == null) {
        throw new Error(data?.error?.message ?? t("Upload se nepodařil"));
      }
      setLogoTs(data.logoUpdatedAt);
      window.dispatchEvent(new Event("lab-logo-changed"));
      notifySuccess(t("Logo nahráno."));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Upload se nepodařil"));
    } finally {
      setLogoBusy(false);
    }
  };

  const resetLogo = async () => {
    setLogoBusy(true);
    try {
      await api.delete("/lab-profile/logo");
      setLogoTs(null);
      window.dispatchEvent(new Event("lab-logo-changed"));
      notifySuccess(t("Logo vráceno na výchozí."));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Akce se nepodařila"));
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <FormPageShell title={t("Profil laboratoře")} backTo="/app/feed">
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <Card withBorder>
            <Title order={4} mb="xs">{t("Identifikace výrobce")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Tyto údaje se tisknou na štítek, dodací list a prohlášení o shodě.")}
            </Text>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <TextInput label={t("Název laboratoře")} required disabled={loading} {...form.getInputProps("name")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 2 }}>
                <TextInput label={t("IČO")} disabled={loading} {...form.getInputProps("ico")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 2 }}>
                <TextInput label={t("DIČ")} disabled={loading} {...form.getInputProps("dic")} />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput label={t("Ulice a č.p.")} disabled={loading} {...form.getInputProps("street")} />
              </Grid.Col>
              <Grid.Col span={{ base: 8, sm: 5 }}>
                <TextInput label={t("Město")} disabled={loading} {...form.getInputProps("city")} />
              </Grid.Col>
              <Grid.Col span={{ base: 4, sm: 2 }}>
                <TextInput label={t("PSČ")} disabled={loading} {...form.getInputProps("zip")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 2.5 }}>
                <TextInput label={t("Telefon")} disabled={loading} {...form.getInputProps("phone")} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 2.5 }}>
                <TextInput label={t("E-mail")} disabled={loading} {...form.getInputProps("email")} />
              </Grid.Col>
            </Grid>
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Číslování zakázek")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Číslo zakázky = prefix + pořadí (0001, 0002…). Sekvence běží pro každý prefix zvlášť.")}
            </Text>
            <Grid gutter="md" align="flex-end">
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <SegmentedControl
                  fullWidth
                  disabled={loading}
                  value={form.values.orderPrefixMode}
                  onChange={(v) =>
                    form.setFieldValue("orderPrefixMode", v as "year" | "custom")
                  }
                  data={[
                    { value: "year", label: t("Podle roku ({year}-)", { year: new Date().getFullYear() }) },
                    { value: "custom", label: t("Vlastní prefix") },
                  ]}
                />
              </Grid.Col>
              {form.values.orderPrefixMode === "custom" && (
                <Grid.Col span={{ base: 12, sm: 3 }}>
                  <TextInput
                    label={t("Prefix")}
                    placeholder={t("např. LAB-")}
                    maxLength={12}
                    disabled={loading}
                    {...form.getInputProps("orderPrefix")}
                  />
                </Grid.Col>
              )}
              <Grid.Col span={{ base: 12, sm: 3 }}>
                <Text size="sm" c="dimmed">
                  {t("Příklad:")}{" "}
                  <Text component="span" fw={600} ff="monospace">
                    {form.values.orderPrefixMode === "custom" && form.values.orderPrefix
                      ? `${form.values.orderPrefix}0001`
                      : `${new Date().getFullYear()}-0001`}
                  </Text>
                </Text>
              </Grid.Col>
            </Grid>
            {form.values.orderPrefixMode === "year" && (
              <Text size="xs" c="dimmed" mt="xs">
                {t("Na Nový rok se prefix změní automaticky (2026- → 2027-) a pořadí začne znovu od 0001.")}
              </Text>
            )}
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Logo aplikace")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Zobrazuje se v hlavičce aplikace místo výchozího 4lab. SVG, PNG, JPEG nebo WebP, max 512 kB — ideálně na výšku ~40 px, průhledné pozadí.")}
            </Text>
            <Group gap="lg" align="center">
              <Box
                p="xs"
                style={{
                  border: "1px solid light-dark(#e5e7eb, #333333)",
                  borderRadius: 8,
                  minWidth: 120,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <img
                  src={logoTs ? `/api/lab-profile/logo?v=${logoTs}` : "/brand/4lab-icon.svg"}
                  alt={t("Logo aplikace")}
                  style={{ height: 40, maxWidth: 220, objectFit: "contain", display: "block" }}
                />
              </Box>
              <Group gap="sm">
                <FileButton onChange={(f) => void uploadLogo(f)} accept="image/svg+xml,image/png,image/jpeg,image/webp">
                  {(props) => (
                    <Button {...props} variant="light" loading={logoBusy}>
                      {t("Nahrát logo")}
                    </Button>
                  )}
                </FileButton>
                {logoTs && (
                  <Button variant="default" disabled={logoBusy} onClick={() => void resetLogo()}>
                    {t("Vrátit výchozí")}
                  </Button>
                )}
              </Group>
            </Group>
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Tiskové formuláře")}</Title>
            <Switch
              label={t("Tiskové formuláře v jazyce aplikace")}
              description={t("Prohlášení o shodě, štítek a dodací list se tisknou v jazyce, který je zrovna zvolený v aplikaci. Vypnuto = tisky vždy česky.")}
              disabled={loading}
              {...form.getInputProps("printInAppLanguage", { type: "checkbox" })}
            />
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Materiály (MDR)")}</Title>
            <Switch
              label={t("Vyžadovat kompletní materiálové složení při dokončení")}
              description={t("Zakázku nepůjde přepnout na Dokončeno, dokud mají recepty nevyřešené návrhy materiálů. Vypnuto = jen upozornění.")}
              disabled={loading}
              {...form.getInputProps("enforceMaterialProposalsOnDone", { type: "checkbox" })}
            />
          </Card>

          <Card withBorder>
            <Title order={4} mb="xs">{t("Záloha dat")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Kompletní SQL dump databáze (zakázky, ceník, materiály, historie…). Lze obnovit do čisté databáze. Přílohy (fotky) jsou uložené zvlášť a součástí dumpu nejsou.")}
            </Text>
            <Button variant="light" loading={exporting} onClick={() => void downloadBackup()}>
              {t("Stáhnout zálohu (SQL)")}
            </Button>
          </Card>

          {usage && (
            <Card withBorder>
              <Title order={4} mb="xs">{t("Úložiště příloh")}</Title>
              <Text size="sm" c="dimmed" mb="sm">
                {t("{count} souborů · {size} z 10 GB (Cloudflare R2 free tier)", { count: usage.count, size: formatBytes(usage.bytes) })}
              </Text>
              <Progress
                value={Math.max((usage.bytes / R2_FREE_TIER_BYTES) * 100, usage.bytes > 0 ? 1 : 0)}
                color={usage.bytes > R2_FREE_TIER_BYTES * 0.8 ? "red" : "teal"}
              />
            </Card>
          )}
          <Group justify="flex-end">
            <Button type="submit" loading={saving} disabled={loading}>
              {t("Uložit")}
            </Button>
          </Group>
        </Stack>
      </form>
    </FormPageShell>
  );
}
