import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Checkbox, Group, Text } from "@mantine/core";
import { api } from "../../api/client";
import type { ClinicListRow } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import PageHeader from "../../components/ui/PageHeader";
import DataTable, { type SortState } from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { usePerms } from "../../auth/usePerms";
import { notifyError } from "../../lib/notify";
import { t } from "../../i18n";

export default function ClinicsPage() {
  const perms = usePerms();
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState("");
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [clinics, setClinics] = useState<ClinicListRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Sekvence proti stale odpovědi při rychlém přepínání filtru.
  const fetchSeq = useRef(0);
  const fetchData = useCallback(async (includeInactive: boolean) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const rows = await api.get<ClinicListRow[]>(
        `/clinics${includeInactive ? "?includeInactive=1" : ""}`,
      );
      if (seq === fetchSeq.current) setClinics(rows);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst kliniky"));
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
    let result = clinics.filter((c) =>
      matchesSearchTokens([c.companyName, c.email ?? "", c.city, c.ico], tokens),
    );

    if (sortState.column && sortState.direction) {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortState.column) {
          case "name": aVal = a.companyName.toLowerCase(); bVal = b.companyName.toLowerCase(); break;
          case "city": aVal = a.city.toLowerCase(); bVal = b.city.toLowerCase(); break;
          case "ico": aVal = a.ico; bVal = b.ico; break;
          case "doctors": aVal = a.doctorCount; bVal = b.doctorCount; break;
          case "status": aVal = a.isActive ? 0 : 1; bVal = b.isActive ? 0 : 1; break;
          default: return 0;
        }
        if (aVal < bVal) return sortState.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortState.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [clinics, searchText, sortState]);

  const columns = [
    {
      key: "name",
      header: t("Klinika"),
      sortable: true,
      primary: true,
      render: (c: ClinicListRow) => (
        <Group gap="xs" wrap="nowrap">
          <Box
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: c.color,
              flexShrink: 0,
            }}
          />
          <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>
            {c.companyName}
          </Text>
        </Group>
      ),
    },
    {
      key: "city",
      header: t("Město"),
      width: "16%",
      sortable: true,
      render: (c: ClinicListRow) => <Text size="sm" c="dimmed">{c.city}</Text>,
    },
    {
      key: "phone",
      header: t("Telefon"),
      width: "14%",
      mobileHidden: true,
      render: (c: ClinicListRow) => <Text size="sm" c="dimmed">{c.phone ?? "—"}</Text>,
    },
    {
      key: "ico",
      header: t("IČO"),
      width: "12%",
      sortable: true,
      mobileHidden: true,
      render: (c: ClinicListRow) => <Text size="sm" c="dimmed" ff="monospace">{c.ico}</Text>,
    },
    {
      key: "doctors",
      header: t("Doktoři"),
      width: "9%",
      align: "center" as const,
      sortable: true,
      mobileHidden: true,
      render: (c: ClinicListRow) => <Text size="sm" c="dimmed">{c.doctorCount}</Text>,
    },
    {
      key: "status",
      header: t("Stav"),
      width: "11%",
      sortable: true,
      render: (c: ClinicListRow) => (
        <Badge size="sm" variant="light" color={c.isActive ? "green" : "gray"}>
          {c.isActive ? t("Aktivní") : t("Neaktivní")}
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
            title={t("Kliniky")}
            count={filtered.length}
            primaryAction={!perms.doctorsEdit ? undefined : {
              label: t("Nová klinika"),
              onClick: () => navigate("/app/clinics/new"),
            }}
            searchPlaceholder={t("Hledat název, město, IČO...")}
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
            emptyMessage={t("Žádné kliniky nenalezeny.")}
            getRowKey={(c) => c.id}
            sortState={sortState}
            onSort={handleSort}
            onRowClick={(c) => navigate(`/app/clinics/${c.id}`)}
          />
        </Box>
      </Box>
    </Box>
  );
}
