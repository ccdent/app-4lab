import { Box, Text } from "@mantine/core";
import { formatDateDDMMYYYY } from "../../shared/dates";
import { t } from "../../i18n";

interface CreatedStockItemSummaryProps {
  shortCode: string;
  manufacturerName: string;
  canonicalName: string;
  lotNumber: string | null;
  expirationDate: string | null;
}

/**
 * Potvrzovací karta po naskladnění nové šarže: velký vygenerovaný kód (technik
 * si ho opíše na disk/obal) + rekapitulace materiálu, LOTu a expirace.
 * Footer (tlačítka) dodává volající — liší se podle kontextu (Šarže materiálů
 * nabízí „Přidat další šarži", order flow jen „Zavřít").
 */
export default function CreatedStockItemSummary({
  shortCode,
  manufacturerName,
  canonicalName,
  lotNumber,
  expirationDate,
}: CreatedStockItemSummaryProps) {
  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Box
        style={{
          backgroundColor: "light-dark(#f3f9d0, #2a3012)",
          borderRadius: 12,
          padding: 20,
          textAlign: "center",
        }}
      >
        <Text size="sm" c="dimmed" mb={4}>
          {t("Vygenerovaný kód")}
        </Text>
        <Text
          ff="monospace"
          fw={700}
          style={{ fontSize: 32, color: "#7E9B12", letterSpacing: 4 }}
        >
          {shortCode}
        </Text>
      </Box>
      <Box
        style={{
          border: "1px solid light-dark(#f3f4f6, #2a2a2a)",
          borderRadius: 8,
          backgroundColor: "light-dark(#f9fafb, #191919)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Materiál přes celou šířku (dlouhý název); LOT + Expirace ve dvou sloupcích. */}
        <Box>
          <Text size="xs" c="dimmed" mb={2}>{t("Materiál")}</Text>
          <Text size="sm" fw={500} c="light-dark(#111827, #ececec)">
            {manufacturerName} – {canonicalName}
          </Text>
        </Box>
        <Box style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Box>
            <Text size="xs" c="dimmed" mb={2}>{t("Šarže (LOT)")}</Text>
            <Text size="sm" fw={500} c="light-dark(#111827, #ececec)">{lotNumber ?? "—"}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed" mb={2}>{t("Expirace")}</Text>
            <Text size="sm" fw={500} c="light-dark(#111827, #ececec)">
              {formatDateDDMMYYYY(expirationDate)}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
