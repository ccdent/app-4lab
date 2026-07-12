import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Checkbox, Group, Text } from "@mantine/core";
import { api } from "../../api/client";
import { doctorDisplayName, type DoctorListRow } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import PageHeader from "../../components/ui/PageHeader";
import DataTable, { type SortState } from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { usePerms } from "../../auth/usePerms";
import { notifyError } from "../../lib/notify";
import { t } from "../../i18n";

export default function DoctorsPage() {
  const perms = usePerms();
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState("");
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [doctors, setDoctors] = useState<DoctorListRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Sekvence proti stale odpovědi při rychlém přepínání filtru.
  const fetchSeq = useRef(0);
  const fetchData = useCallback(async (includeInactive: boolean) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const rows = await api.get<DoctorListRow[]>(
        `/doctors${includeInactive ? "?includeInactive=1" : ""}`,
      );
      if (seq === fetchSeq.current) setDoctors(rows);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst doktory"));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(showDeactivated);
  }, [fetchData, showDeactivated]);

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
    let result = doctors.filter((d) =>
      matchesSearchTokens(
        [doctorDisplayName(d), d.clinicName, d.email ?? "", d.phone ?? ""],
        tokens,
      ),
    );

    if (sortState.column && sortState.direction) {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortState.column) {
          case "name": aVal = a.lastName.toLowerCase(); bVal = b.lastName.toLowerCase(); break;
          case "clinic": aVal = a.clinicName.toLowerCase(); bVal = b.clinicName.toLowerCase(); break;
          case "status": aVal = a.isActive ? 0 : 1; bVal = b.isActive ? 0 : 1; break;
          default: return 0;
        }
        if (aVal < bVal) return sortState.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortState.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [doctors, searchText, sortState]);

  const columns = [
    {
      key: "name",
      header: t("Doktor"),
      sortable: true,
      primary: true,
      render: (d: DoctorListRow) => (
        <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>
          {doctorDisplayName(d)}
        </Text>
      ),
    },
    {
      key: "clinic",
      header: t("Klinika"),
      width: "22%",
      sortable: true,
      render: (d: DoctorListRow) => (
        <Group gap="xs" wrap="nowrap">
          <Box
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: d.clinicColor,
              flexShrink: 0,
            }}
          />
          <Text size="sm" c="dimmed">{d.clinicName}</Text>
        </Group>
      ),
    },
    {
      key: "phone",
      header: t("Telefon"),
      width: "15%",
      mobileHidden: true,
      render: (d: DoctorListRow) => <Text size="sm" c="dimmed">{d.phone ?? "—"}</Text>,
    },
    {
      key: "email",
      header: t("E-mail"),
      width: "20%",
      mobileHidden: true,
      render: (d: DoctorListRow) => <Text size="sm" c="dimmed">{d.email ?? "—"}</Text>,
    },
    {
      key: "status",
      header: t("Stav"),
      width: "11%",
      sortable: true,
      render: (d: DoctorListRow) => (
        <Badge size="sm" variant="light" color={d.isActive ? "green" : "gray"}>
          {d.isActive ? t("Aktivní") : t("Neaktivní")}
        </Badge>
      ),
    },
  ];

  return (
    <Box style={{ backgroundColor: CRM_TABLE_PAGE_BG, minHeight: "100%" }}>
      <Box p={{ base: 12, sm: 32 }}>
        <Box style={CRM_TABLE_CARD}>
          <PageHeader
            variant="card"
            title={t("Doktoři")}
            count={filtered.length}
            primaryAction={!perms.doctorsEdit ? undefined : {
              label: t("Nový doktor"),
              onClick: () => navigate("/app/doctors/new"),
            }}
            searchPlaceholder={t("Hledat jméno, kliniku, kontakt...")}
            searchValue={searchText}
            onSearchChange={setSearchText}
            secondaryActions={
              <Checkbox
                label={t("Zobrazit deaktivované")}
                checked={showDeactivated}
                onChange={(e) => setShowDeactivated(e.currentTarget.checked)}
                size="xs"
              />
            }
          />
          <DataTable
            variant="card"
            columns={columns}
            data={filtered}
            loading={loading}
            emptyMessage={t("Žádní doktoři nenalezeni.")}
            getRowKey={(d) => d.id}
            sortState={sortState}
            onSort={handleSort}
            onRowClick={(d) => navigate(`/app/doctors/${d.id}`)}
          />
        </Box>
      </Box>
    </Box>
  );
}
