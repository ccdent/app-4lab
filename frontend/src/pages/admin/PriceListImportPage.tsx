import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconDownload,
  IconUpload,
} from "@tabler/icons-react";
import ExcelJS from "exceljs";
import FormPageShell from "../../components/ui/FormPageShell";
import { api, ApiError } from "../../api/client";
import { kcToHalere } from "../../shared/money";
import { notifyError } from "../../lib/notify";
import { t } from "../../i18n";

/* ------------------------------------------------------------------ */
/*  Formát souboru                                                     */
/* ------------------------------------------------------------------ */

// Hlavička listu — jediný zdroj pravdy pro pořadí i parser.
// Ceny jsou v Kč (na server jdou v haléřích).
const COLUMN_HEADERS = [
  "code",
  "name",
  "short_name",
  "category",
  "group",
  "price",
  "technician_fee",
  "production_days",
] as const;

const SHEET_MAIN = "Položky";

interface ParsedRow {
  excelRow: number;
  code: string;
  name: string;
  shortName: string;
  category: string;
  group: string;
  price: string;
  technicianFee: string;
  productionDays: string;
}

interface ImportRow {
  code: string;
  name: string;
  shortName: string;
  category: string;
  group: string | null;
  /** Haléře. */
  price: number;
  technicianFee: number;
  productionDays: number | null;
}

interface Issue {
  excelRow: number;
  message: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "preview"; fileName: string; rows: ImportRow[]; issues: Issue[] }
  | { kind: "importing"; fileName: string; rows: ImportRow[] }
  | { kind: "done"; insertedItems: number; createdCategories: number; createdGroups: number };

/* ------------------------------------------------------------------ */
/*  Parse + validace                                                   */
/* ------------------------------------------------------------------ */

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  if (typeof v === "object" && "richText" in v) {
    return v.richText.map((t) => t.text).join("").trim();
  }
  return String(v).trim();
}

async function parseFile(buffer: ArrayBuffer): Promise<{ rows: ParsedRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { rows: [], errors: [t("Soubor se nepodařilo načíst jako XLSX.")] };
  }

  const ws = wb.getWorksheet(SHEET_MAIN) ?? wb.worksheets[0];
  if (!ws) return { rows: [], errors: [t("Soubor neobsahuje žádný list.")] };

  const headerRow = ws.getRow(1);
  for (let i = 0; i < COLUMN_HEADERS.length; i++) {
    const found = cellText(headerRow.getCell(i + 1).value);
    if (found !== COLUMN_HEADERS[i]) {
      return {
        rows: [],
        errors: [
          t(`Špatná hlavička ve sloupci {col}: očekáváno „{expected}", nalezeno „{found}". Stáhni si aktuální šablonu.`, {
            col: i + 1,
            expected: COLUMN_HEADERS[i],
            found: found || t("(prázdné)"),
          }),
        ],
      };
    }
  }

  const rows: ParsedRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = COLUMN_HEADERS.map((_, i) => cellText(row.getCell(i + 1).value));
    if (cells.every((x) => x === "")) return;
    rows.push({
      excelRow: rowNumber,
      code: cells[0],
      name: cells[1],
      shortName: cells[2],
      category: cells[3],
      group: cells[4],
      price: cells[5],
      technicianFee: cells[6],
      productionDays: cells[7],
    });
  });

  return { rows, errors: [] };
}

function parseNumber(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function validate(parsed: ParsedRow[]): { rows: ImportRow[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const rows: ImportRow[] = [];
  const codes = new Set<string>();

  for (const r of parsed) {
    let ok = true;
    const fail = (message: string) => {
      issues.push({ excelRow: r.excelRow, message });
      ok = false;
    };

    if (!r.code) fail(t("Chybí code."));
    else if (codes.has(r.code)) fail(t(`Duplicitní code „{code}" v souboru.`, { code: r.code }));
    // kód registrovat i u nevalidního řádku — duplicita se musí ukázat
    // hned, ne až po opravě prvního výskytu (druhé kolo importu)
    else codes.add(r.code);
    if (!r.name) fail(t("Chybí name."));
    if (!r.shortName) fail(t("Chybí short_name."));
    if (!r.category) fail(t("Chybí category."));

    const price = parseNumber(r.price);
    if (price == null || price < 0) fail(t("price musí být číslo >= 0."));

    const fee = r.technicianFee === "" ? 0 : parseNumber(r.technicianFee);
    if (fee == null || fee < 0) fail(t("technician_fee musí být číslo >= 0."));

    let days: number | null = null;
    if (r.productionDays !== "") {
      const d = parseNumber(r.productionDays);
      if (d == null || d < 0 || !Number.isInteger(d)) fail(t("production_days musí být celé číslo >= 0."));
      else days = d;
    }

    if (ok) {
      codes.add(r.code);
      rows.push({
        code: r.code,
        name: r.name,
        shortName: r.shortName,
        category: r.category,
        group: r.group || null,
        price: kcToHalere(price!),
        technicianFee: kcToHalere(fee!),
        productionDays: days,
      });
    }
  }

  return { rows, issues };
}

/* ------------------------------------------------------------------ */
/*  Šablona                                                            */
/* ------------------------------------------------------------------ */

async function downloadTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_MAIN);
  ws.addRow([...COLUMN_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["K01", "Korunka celokeramická", "Korunka CK", "Fixní protetika", "Standard", 3500, 800, 5]);
  ws.addRow(["K02", "Členská korunka — příklad bez skupiny", "Korunka X", "Fixní protetika", "", 2900, 650, ""]);
  ws.columns.forEach((col, i) => {
    col.width = [10, 40, 22, 22, 14, 10, 14, 16][i] ?? 14;
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cenik-import-sablona.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Stránka                                                            */
/* ------------------------------------------------------------------ */

export default function PriceListImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const handleFile = useCallback(async (file: File) => {
    setPhase({ kind: "parsing" });
    try {
      const { rows: parsed, errors } = await parseFile(await file.arrayBuffer());
      if (errors.length) {
        notifyError(errors[0]);
        setPhase({ kind: "idle" });
        return;
      }
      const { rows, issues } = validate(parsed);
      setPhase({ kind: "preview", fileName: file.name, rows, issues });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Zpracování souboru selhalo"));
      setPhase({ kind: "idle" });
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (phase.kind !== "preview") return;
    setPhase({ kind: "importing", fileName: phase.fileName, rows: phase.rows });
    try {
      const result = await api.post<{
        insertedItems: number;
        createdCategories: number;
        createdGroups: number;
      }>("/price-list-items/import", { rows: phase.rows });
      setPhase({ kind: "done", ...result });
    } catch (err) {
      notifyError(
        err instanceof ApiError ? err.message : t("Import se nepodařil — nic nebylo uloženo."),
      );
      setPhase({ kind: "preview", fileName: phase.fileName, rows: phase.rows, issues: [] });
    }
  }, [phase]);

  return (
    <FormPageShell title={t("Import ceníku z XLSX")} backTo="/app/price-list">
      <Stack gap="lg">
        <Card withBorder>
          <Title order={4} mb="xs">{t("Jak na to")}</Title>
          <Text size="sm" c="dimmed">
            {t("1. Stáhni šablonu a vyplň položky (sloupce")}{" "}<Code>code</Code>, <Code>name</Code>,{" "}
            <Code>short_name</Code>, <Code>category</Code>, <Code>group</Code>,{" "}
            <Code>price</Code> {t("v Kč")}, <Code>technician_fee</Code> {t("v Kč")},{" "}
            <Code>production_days</Code>{t("). 2. Nahraj soubor a zkontroluj náhled. 3. Potvrď import — proběhne celý, nebo vůbec (žádné částečné stavy).")}
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {t("Kategorie a skupiny se párují podle názvu; neexistující se automaticky založí. Prázdná skupina = položka se nenabízí v zakázkách.")}
          </Text>
          <Group mt="md" gap="sm">
            <Button
              variant="default"
              leftSection={<IconDownload size={18} />}
              onClick={() => void downloadTemplate()}
            >
              {t("Stáhnout šablonu")}
            </Button>
            <Button
              leftSection={<IconUpload size={18} />}
              loading={phase.kind === "parsing"}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("Nahrát XLSX")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) void handleFile(f);
              }}
            />
          </Group>
        </Card>

        {(phase.kind === "preview" || phase.kind === "importing") && (
          <Card withBorder>
            <Group justify="space-between" mb="md">
              <Title order={4}>
                {t("Náhled —")} {phase.fileName}{" "}
                <Badge variant="light" color="teal" ml="xs">{t("{count} položek", { count: phase.rows.length })}</Badge>
              </Title>
              <Button
                loading={phase.kind === "importing"}
                disabled={
                  phase.rows.length === 0 ||
                  (phase.kind === "preview" && phase.issues.length > 0)
                }
                onClick={() => void handleImport()}
              >
                {t("Importovat {count} položek", { count: phase.rows.length })}
              </Button>
            </Group>

            {phase.kind === "preview" && phase.issues.length > 0 && (
              <Alert color="red" icon={<IconAlertTriangle size={18} />} mb="md">
                <Text size="sm" fw={600} mb={4}>
                  {t("Soubor obsahuje chyby — oprav je a nahraj znovu:")}
                </Text>
                {phase.issues.slice(0, 20).map((i, idx) => (
                  <Text size="sm" key={idx}>{t("Řádek {row}:", { row: i.excelRow })} {i.message}</Text>
                ))}
                {phase.issues.length > 20 && (
                  <Text size="sm" c="dimmed">{t("…a dalších {count}", { count: phase.issues.length - 20 })}</Text>
                )}
              </Alert>
            )}

            <Box style={{ overflowX: "auto" }}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    {COLUMN_HEADERS.map((h) => (
                      <Table.Th key={h}>{h}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {phase.rows.slice(0, 50).map((r) => (
                    <Table.Tr key={r.code}>
                      <Table.Td>{r.code}</Table.Td>
                      <Table.Td>{r.name}</Table.Td>
                      <Table.Td>{r.shortName}</Table.Td>
                      <Table.Td>{r.category}</Table.Td>
                      <Table.Td>{r.group ?? "—"}</Table.Td>
                      <Table.Td>{r.price / 100}</Table.Td>
                      <Table.Td>{r.technicianFee / 100}</Table.Td>
                      <Table.Td>{r.productionDays ?? "—"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {phase.rows.length > 50 && (
                <Text size="sm" c="dimmed" p="sm">
                  {t("Náhled zkrácen — importuje se všech {count} řádků.", { count: phase.rows.length })}
                </Text>
              )}
            </Box>
          </Card>
        )}

        {phase.kind === "done" && (
          <Card withBorder>
            <Group gap="sm">
              <IconCircleCheckFilled size={28} style={{ color: "light-dark(#161616, #f2f2f2)" }} />
              <Box>
                <Text fw={600}>
                  {t("Import hotový — {count} položek", { count: phase.insertedItems })}
                  {phase.createdCategories > 0 && t(", {count} nových kategorií", { count: phase.createdCategories })}
                  {phase.createdGroups > 0 && t(", {count} nových skupin", { count: phase.createdGroups })}.
                </Text>
                <Anchor component={Link} to="/app/price-list" size="sm">
                  {t("Přejít na ceník")}
                </Anchor>
              </Box>
            </Group>
          </Card>
        )}
      </Stack>
    </FormPageShell>
  );
}
