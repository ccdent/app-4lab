import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Chip, Group, Text } from "@mantine/core";
import dayjs from "dayjs";
import { api } from "../../api/client";
import { doctorDisplayName, type OrderListRow } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import { formatHalere } from "../../shared/money";
import {
  OPEN_STATES,
  ORDER_STATES,
  STATE_COLOR,
  STATE_LABEL,
  type OrderState,
} from "../../shared/orderStates";
import { t } from "../../i18n";
import PageHeader from "../../components/ui/PageHeader";
import DataTable, { type SortState } from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { notifyError } from "../../lib/notify";

type StateFilter = "open" | "all" | OrderState;

const FILTER_CHIPS: { value: StateFilter; label: string }[] = [
  { value: "open", label: "Rozpracované" },
  ...ORDER_STATES.map((s) => ({ value: s as StateFilter, label: STATE_LABEL[s] })),
  { value: "all", label: "Vše" },
];

/** České skloňování dnů: 1 den, 2–4 dny, 5+ dní. */
function dnyLabel(n: number): string {
  if (n === 1) return "den";
  if (n >= 2 && n <= 4) return "dny";
  return "dní";
}

function dueBadge(order: OrderListRow) {
  if (order.state === "done" || order.state === "storno") return null;
  const due = dayjs(order.completionDueAt);
  const today = dayjs().startOf("day");
  const days = due.diff(today, "day");
  if (days < 0) return { color: "red", label: t("{n} {dny} po termínu", { n: -days, dny: t(dnyLabel(-days)) }) };
  if (days === 0) return { color: "orange", label: t("Dnes") };
  if (days <= 2) return { color: "yellow", label: days === 1 ? t("Zítra") : t("Za {n} dny", { n: days }) };
  return null;
}

export default function OrdersPage() {
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("open");
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [rows, setRows] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Sekvence proti stale odpovědi při rychlém klikání na filtry stavů.
  const fetchSeq = useRef(0);
  const fetchData = useCallback(async (filter: StateFilter) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const q =
        filter === "all"
          ? ""
          : filter === "open"
            ? `?state=${OPEN_STATES.join(",")}`
            : `?state=${filter}`;
      const rows = await api.get<OrderListRow[]>(`/orders${q}`);
      if (seq === fetchSeq.current) setRows(rows);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst zakázky"));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(stateFilter);
  }, [fetchData, stateFilter]);

  const handleSort = (column: string) => {
    setSortState((s) => {
      if (s.column === column) {
        if (s.direction === "asc") return { column, direction: "desc" as const };
        if (s.direction === "desc") return { column: null, direction: null };
      }
      return { column, direction: "asc" as const };
    });
  };

  const filtered = useMemo(() => {
    const tokens = getSearchTokens(searchText);
    let result = rows.filter((o) =>
      matchesSearchTokens(
        [
          o.orderNumber,
          o.patientName,
          o.clinicName,
          doctorDisplayName({
            titlePrefix: o.doctorTitlePrefix,
            firstName: o.doctorFirstName,
            lastName: o.doctorLastName,
          }),
        ],
        tokens,
      ),
    );

    if (sortState.column && sortState.direction) {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortState.column) {
          case "number": aVal = a.orderNumber; bVal = b.orderNumber; break;
          case "patient": aVal = a.patientName.toLowerCase(); bVal = b.patientName.toLowerCase(); break;
          case "clinic": aVal = a.doctorLastName.toLowerCase(); bVal = b.doctorLastName.toLowerCase(); break;
          case "due": aVal = a.completionDueAt; bVal = b.completionDueAt; break;
          case "total": aVal = a.itemsTotal; bVal = b.itemsTotal; break;
          default: return 0;
        }
        if (aVal < bVal) return sortState.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortState.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [rows, searchText, sortState]);

  const columns = [
    {
      key: "number",
      header: t("Číslo"),
      width: "10%",
      sortable: true,
      render: (o: OrderListRow) => (
        <Text size="sm" fw={600} ff="monospace" style={{ color: "light-dark(#111827, #ececec)" }}>
          {o.orderNumber}
        </Text>
      ),
    },
    {
      key: "patient",
      header: t("Pacient"),
      sortable: true,
      primary: true,
      render: (o: OrderListRow) => (
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{o.patientName}</Text>
          {o.itemsSummary && (
            <Text size="xs" c="dimmed" lineClamp={1}>{o.itemsSummary}</Text>
          )}
        </Box>
      ),
    },
    {
      key: "clinic",
      header: t("Doktor"),
      width: "22%",
      sortable: true,
      render: (o: OrderListRow) => (
        <Group gap="xs" wrap="nowrap" align="stretch">
          {/* Barva kliniky jako svislý proužek přes výšku řádku (ne "přilepená" tečka). */}
          <Box
            style={{
              width: 5,
              alignSelf: "stretch",
              minHeight: 30,
              borderRadius: 3,
              backgroundColor: o.clinicColor,
              flexShrink: 0,
            }}
          />
          <Box>
            <Text size="sm" c="dimmed">
              {doctorDisplayName({
                titlePrefix: o.doctorTitlePrefix,
                firstName: o.doctorFirstName,
                lastName: o.doctorLastName,
              })}
            </Text>
            <Text size="xs" c="dimmed">({o.clinicName})</Text>
          </Box>
        </Group>
      ),
    },
    {
      key: "due",
      header: t("Termín"),
      width: "14%",
      sortable: true,
      render: (o: OrderListRow) => {
        const badge = dueBadge(o);
        return (
          <Group gap={6} wrap="nowrap">
            <Text size="sm" c="dimmed">{dayjs(o.completionDueAt).format("D. M. YYYY")}</Text>
            {badge && (
              <Badge size="xs" variant="light" color={badge.color}>{badge.label}</Badge>
            )}
          </Group>
        );
      },
    },
    {
      key: "technician",
      header: t("Technik"),
      width: "13%",
      mobileHidden: true,
      render: (o: OrderListRow) => (
        <Text size="sm" c="dimmed">
          {o.technicianFirstName ? `${o.technicianFirstName} ${o.technicianLastName}` : "—"}
        </Text>
      ),
    },
    {
      key: "total",
      header: t("Cena"),
      width: "10%",
      align: "right" as const,
      sortable: true,
      mobileHidden: true,
      render: (o: OrderListRow) => (
        <Text size="sm" c="dimmed">{formatHalere(o.itemsTotal)}</Text>
      ),
    },
    {
      key: "state",
      header: t("Stav"),
      width: "11%",
      render: (o: OrderListRow) => (
        <Group gap={4} wrap="nowrap">
          <Badge size="sm" variant="light" color={STATE_COLOR[o.state]}>
            {t(STATE_LABEL[o.state])}
          </Badge>
          {o.isBilled && (
            <Badge size="sm" variant="outline" color="teal">{t("Fakturováno")}</Badge>
          )}
        </Group>
      ),
    },
  ];

  return (
    <Box style={{ backgroundColor: CRM_TABLE_PAGE_BG, minHeight: "100%" }}>
      <Box p={{ base: 12, sm: 32 }}>
        <Box style={CRM_TABLE_CARD}>
          <PageHeader
            variant="card"
            title={t("Zakázky")}
            count={filtered.length}
            primaryAction={{
              label: t("Nová zakázka"),
              onClick: () => navigate("/app/orders/new"),
            }}
            searchPlaceholder={t("Hledat číslo, pacienta, kliniku...")}
            searchValue={searchText}
            onSearchChange={setSearchText}
          />
          <Box px={{ base: 12, sm: 24 }} py={8} style={{ borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)" }}>
            <Chip.Group
              value={stateFilter}
              onChange={(v) => setStateFilter((v as StateFilter) ?? "open")}
            >
              <Group gap={6}>
                {FILTER_CHIPS.map((f) => (
                  <Chip key={f.value} value={f.value} size="xs" variant="filled" autoContrast>
                    {t(f.label)}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Box>
          <DataTable
            variant="card"
            columns={columns}
            data={filtered}
            loading={loading}
            emptyMessage={t("Žádné zakázky.")}
            getRowKey={(o) => o.id}
            sortState={sortState}
            onSort={handleSort}
            onRowClick={(o) => navigate(`/app/orders/${o.id}`)}
          />
        </Box>
      </Box>
    </Box>
  );
}
