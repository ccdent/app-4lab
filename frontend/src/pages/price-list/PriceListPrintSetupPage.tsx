import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, Group, Select, Stack, Text, Title } from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import { api } from "../../api/client";
import { doctorDisplayName, type DoctorListRow } from "../../api/types";
import FormPageShell from "../../components/ui/FormPageShell";
import { notifyError } from "../../lib/notify";
import { t } from "../../i18n";

interface PrintPreview {
  items: { id: string }[];
}

/**
 * Tisk ceníku pro doktora — vybere se doktor, vygeneruje se ceník podle
 * skupin jeho kliniky (stejné pravidlo jako výběr položek v zakázce).
 * Výstup je tisková stránka (PDF přes prohlížeč) k předání / poslání mailem.
 */
export default function PriceListPrintSetupPage() {
  const [doctors, setDoctors] = useState<DoctorListRow[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);

  useEffect(() => {
    void api
      .get<DoctorListRow[]>("/doctors")
      .then(setDoctors)
      .catch((e) => notifyError(e instanceof Error ? e.message : t("Nepodařilo se načíst doktory")));
  }, []);

  // Počet položek pro náhled — ať je před tiskem vidět, že doktor něco dostane.
  useEffect(() => {
    if (!doctorId) {
      setItemCount(null);
      return;
    }
    let cancelled = false;
    void api
      .get<PrintPreview>(`/price-list-items/print/for-doctor?doctorId=${doctorId}`)
      .then((r) => {
        if (!cancelled) setItemCount(r.items.length);
      })
      .catch(() => {
        if (!cancelled) setItemCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  const options = useMemo(
    () =>
      doctors.map((d) => ({
        value: d.id,
        label: `${doctorDisplayName(d)} (${d.clinicName})`,
      })),
    [doctors],
  );

  return (
    <FormPageShell title={t("Tisk ceníku")} backTo="/app/price-list">
      <Card withBorder>
        <Title order={4} mb="xs">{t("Ceník pro doktora")}</Title>
        <Text size="sm" c="dimmed" mb="md">
          {t("Vyber doktora — vygeneruje se ceník s položkami, které patří jeho klinice (podle ceníkových skupin). Výstup je formátovaný pro tisk nebo uložení do PDF (poslání mailem).")}
        </Text>
        <Stack gap="md" maw={520}>
          <Select
            label={t("Doktor")}
            searchable
            placeholder={t("Vyber doktora…")}
            nothingFoundMessage={t("Nenalezeno")}
            data={options}
            value={doctorId}
            onChange={setDoctorId}
          />
          {doctorId && itemCount === 0 && (
            <Alert color="yellow" variant="light">
              {t("Klinika tohoto doktora nemá přiřazené žádné ceníkové skupiny — ceník by byl prázdný. Přiřaď skupiny na kartě kliniky.")}
            </Alert>
          )}
          {doctorId && itemCount !== null && itemCount > 0 && (
            <Text size="sm" c="dimmed">{t("Ceník obsahuje {n} položek.", { n: itemCount })}</Text>
          )}
          <Group>
            <Button
              leftSection={<IconPrinter size={16} />}
              disabled={!doctorId || itemCount === 0}
              onClick={() => window.open(`/app/price-list/print/${doctorId}`, "_blank")}
            >
              {t("Vytisknout ceník")}
            </Button>
          </Group>
        </Stack>
      </Card>
      <Box mt="md" />
    </FormPageShell>
  );
}
