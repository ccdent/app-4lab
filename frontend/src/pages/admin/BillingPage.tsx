import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconFileSpreadsheet, IconPrinter, IconReceipt } from "@tabler/icons-react";
import dayjs from "dayjs";
import { api } from "../../api/client";
import { doctorDisplayName, type BillingRow } from "../../api/types";
import { formatHalere } from "../../shared/money";
import { monthLabel, monthOptions } from "../../shared/months";
import FormPageShell from "../../components/ui/FormPageShell";
import { confirm } from "../../lib/confirm";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

/** Fakturační podklad — dokončené zakázky měsíce po klinikách. */
export default function BillingPage() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);

  const fetchSeq = useRef(0);
  const fetchData = useCallback(async (m: string) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const data = await api.get<BillingRow[]>(`/billing?month=${m}`);
      if (seq === fetchSeq.current) {
        setRows(data);
        setSelected(new Set());
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst podklad"));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(month);
  }, [fetchData, month]);

  const byClinic = useMemo(() => {
    const map = new Map<string, { clinicId: string; clinicName: string; rows: BillingRow[] }>();
    for (const r of rows) {
      if (!map.has(r.clinicId)) map.set(r.clinicId, { clinicId: r.clinicId, clinicName: r.clinicName, rows: [] });
      map.get(r.clinicId)!.rows.push(r);
    }
    return [...map.values()];
  }, [rows]);

  const unbilled = rows.filter((r) => !r.isBilled);
  const totalAll = rows.reduce((s, r) => s + r.billableTotal, 0);
  const totalSelected = rows
    .filter((r) => selected.has(r.id))
    .reduce((s, r) => s + r.billableTotal, 0);

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleClinic = (clinicRows: BillingRow[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of clinicRows) {
        if (r.isBilled) continue;
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };

  const markSelected = async () => {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: t("Označit jako vyfakturované"),
      message: t("Označit {count} zakázek ({total}) jako vyfakturované? Zakázky se zamknou — půjde u nich měnit jen Dokončeno ↔ Storno.", { count: selected.size, total: formatHalere(totalSelected) }),
      confirmLabel: t("Vyfakturováno"),
    });
    if (!ok) return;
    setMarking(true);
    try {
      await api.post("/billing/mark", { orderIds: [...selected] });
      notifySuccess(t("{count} zakázek označeno jako vyfakturované.", { count: selected.size }));
      void fetchData(month);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Označení se nepodařilo"));
    } finally {
      setMarking(false);
    }
  };

  const unmark = async (r: BillingRow) => {
    const ok = await confirm({
      title: t("Zrušit fakturaci"),
      message: t(`Zrušit označení „vyfakturováno" u zakázky {orderNumber}? Zakázka se zase odemkne pro úpravy.`, { orderNumber: r.orderNumber }),
      confirmLabel: t("Zrušit fakturaci"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.post("/billing/unmark", { orderIds: [r.id] });
      notifySuccess(t("Fakturace zakázky {orderNumber} zrušena.", { orderNumber: r.orderNumber }));
      void fetchData(month);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Zrušení se nepodařilo"));
    }
  };

  /** XLSX export (exceljs — dynamický import, v bundlu jen na vyžádání). */
  const exportXlsx = async () => {
    try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    // Hlavičky i název listu drží česky — export čtou účetní/skripty,
    // nesmí se měnit podle UI jazyka technika.
    const ws = wb.addWorksheet(monthLabel(month).slice(0, 31));
    ws.addRow([
      "Klinika", "Číslo zakázky", "Pacient", "Doktor",
      "Položky", "Dokončeno", "Částka (Kč)", "Fakturováno",
    ]);
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      const row = ws.addRow([
        r.clinicName,
        r.orderNumber,
        r.patientName,
        doctorDisplayName({
          titlePrefix: r.doctorTitlePrefix,
          firstName: r.doctorFirstName,
          lastName: r.doctorLastName,
        }),
        r.items
          .map(
            (it) =>
              `${it.quantity > 1 ? `${it.quantity}× ` : ""}${it.name}${it.localization ? ` (${it.localization})` : ""} · ${(it.unitPrice * it.quantity) / 100} Kč`,
          )
          .join("\n"),
        r.doneAt ? dayjs(r.doneAt).format("DD.MM.YYYY") : "",
        r.billableTotal / 100,
        // Export čte účetní / návazné skripty — hodnoty držíme česky bez ohledu na UI jazyk.
        r.isBilled ? "ano" : "ne",
      ]);
      row.getCell(5).alignment = { wrapText: true, vertical: "top" };
    }
    ws.columns.forEach((col, i) => {
      col.width = [24, 13, 22, 22, 48, 11, 12, 12][i] ?? 14;
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fakturace-${month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notifySuccess(t("Export fakturace za {month} stažen.", { month: monthLabel(month) }));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Export se nepodařil — obnov stránku a zkus znovu."));
    }
  };

  return (
    <FormPageShell
      title={t("Fakturační podklad")}
      backTo="/app/feed"
      actions={
        <Group gap="sm">
          <Button
            variant="light"
            leftSection={<IconFileSpreadsheet size={16} />}
            disabled={rows.length === 0}
            onClick={() => void exportXlsx()}
          >
            XLSX
          </Button>
          <Button
            variant="light"
            leftSection={<IconPrinter size={16} />}
            disabled={rows.length === 0}
            onClick={() => window.open(`/app/admin/billing/print?month=${month}`, "_blank")}
          >
            {t("Tisk")}
          </Button>
        </Group>
      }
    >
      <Stack gap="lg">
        <Card withBorder>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="sm">
              <Select
                w={200}
                value={month}
                onChange={(v) => v && setMonth(v)}
                data={monthOptions()}
                allowDeselect={false}
              />
              <Text size="sm" c="dimmed">
                {t("{count} dokončených zakázek · celkem {total}", { count: rows.length, total: formatHalere(totalAll) })}
              </Text>
            </Group>
            <Button
              leftSection={<IconReceipt size={16} />}
              disabled={selected.size === 0}
              loading={marking}
              onClick={() => void markSelected()}
            >
              {t("Vyfakturováno")} ({selected.size}{selected.size > 0 ? ` · ${formatHalere(totalSelected)}` : ""})
            </Button>
          </Group>
          {unbilled.length > 0 && (
            <Checkbox
              mt="sm"
              size="xs"
              label={t("Vybrat vše nevyfakturované ({count})", { count: unbilled.length })}
              checked={unbilled.length > 0 && unbilled.every((r) => selected.has(r.id))}
              onChange={(e) => toggleClinic(rows, e.currentTarget.checked)}
            />
          )}
        </Card>

        {loading ? null : byClinic.length === 0 ? (
          <Card withBorder>
            <Text size="sm" c="dimmed">{t("V tomto měsíci nejsou žádné dokončené zakázky.")}</Text>
          </Card>
        ) : (
          byClinic.map((group) => {
            const clinicUnbilled = group.rows.filter((r) => !r.isBilled);
            const clinicTotal = group.rows.reduce((s, r) => s + r.billableTotal, 0);
            return (
              <Card withBorder key={group.clinicId}>
                <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
                  <Group gap="sm">
                    <Title order={4}>{group.clinicName}</Title>
                    <Badge variant="light" color="gray">{group.rows.length}</Badge>
                  </Group>
                  {clinicUnbilled.length > 0 && (
                    <Checkbox
                      size="xs"
                      label={t("Vybrat kliniku ({count})", { count: clinicUnbilled.length })}
                      checked={clinicUnbilled.every((r) => selected.has(r.id))}
                      onChange={(e) => toggleClinic(group.rows, e.currentTarget.checked)}
                    />
                  )}
                </Group>
                <Box style={{ overflowX: "auto" }}>
                  <Table style={{ minWidth: 620 }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th style={{ width: 36 }} />
                        <Table.Th>{t("Číslo")}</Table.Th>
                        <Table.Th>{t("Pacient")}</Table.Th>
                        <Table.Th>{t("Doktor")}</Table.Th>
                        <Table.Th>{t("Dokončeno")}</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>{t("Částka")}</Table.Th>
                        <Table.Th style={{ width: 220 }}>{t("Stav")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {group.rows.map((r) => (
                        <Table.Tr key={r.id}>
                          <Table.Td>
                            {!r.isBilled && (
                              <Checkbox
                                size="xs"
                                checked={selected.has(r.id)}
                                onChange={(e) => toggle(r.id, e.currentTarget.checked)}
                              />
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" ff="monospace" fw={600}>{r.orderNumber}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{r.patientName}</Text>
                            {/* Plné názvy položek + lokalizace + cena — ať je zřejmé, co se fakturuje. */}
                            {r.items.map((it, idx) => (
                              <Text key={idx} size="xs" c="dimmed">
                                {it.quantity > 1 ? `${it.quantity}× ` : ""}
                                {it.name}
                                {it.localization ? ` (${it.localization})` : ""}
                                {" · "}
                                {formatHalere(it.unitPrice * it.quantity)}
                              </Text>
                            ))}
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="dimmed">
                              {doctorDisplayName({
                                titlePrefix: r.doctorTitlePrefix,
                                firstName: r.doctorFirstName,
                                lastName: r.doctorLastName,
                              })}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="dimmed">
                              {r.doneAt ? dayjs(r.doneAt).format("D. M. YYYY") : "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            <Text size="sm" fw={600}>{formatHalere(r.billableTotal)}</Text>
                          </Table.Td>
                          <Table.Td>
                            {r.isBilled ? (
                              <Group gap={6} wrap="nowrap">
                                {/* flexShrink 0 — badge se nesmí ořezávat na „Fakt…" */}
                                <Badge
                                  size="sm"
                                  variant="outline"
                                  color="teal"
                                  style={{ flexShrink: 0 }}
                                >
                                  {t("Fakturováno")}
                                </Badge>
                                <Button
                                  size="compact-xs"
                                  variant="subtle"
                                  color="red"
                                  style={{ flexShrink: 0 }}
                                  onClick={() => void unmark(r)}
                                >
                                  {t("Zrušit")}
                                </Button>
                              </Group>
                            ) : (
                              <Badge size="sm" variant="light" color="yellow" style={{ flexShrink: 0 }}>
                                {t("K fakturaci")}
                              </Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Box>
                <Group justify="flex-end" mt={8} pr={8}>
                  <Text size="sm" c="dimmed">{t("Celkem za kliniku")}</Text>
                  <Text size="md" fw={700}>{formatHalere(clinicTotal)}</Text>
                </Group>
              </Card>
            );
          })
        )}
      </Stack>
    </FormPageShell>
  );
}
