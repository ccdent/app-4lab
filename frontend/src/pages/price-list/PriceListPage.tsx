import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Checkbox, Group, Text } from "@mantine/core";
import { api } from "../../api/client";
import type { PriceListCategory, PriceListItemRow } from "../../api/types";
import { getSearchTokens, matchesSearchTokens } from "../../shared/search";
import { formatHalere } from "../../shared/money";
import PageHeader from "../../components/ui/PageHeader";
import DataTable, { type SortState } from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { usePerms } from "../../auth/usePerms";
import { notifyError } from "../../lib/notify";
import { t } from "../../i18n";

// Klíče jsou české zdrojové texty — překlad se dosadí přes t() až při renderu
// (modulová konstanta se vyhodnotí jen jednou, před případnou změnou jazyka).
const KIND_LABEL: Record<string, string> = {
  none: "pomocná položka",
  single: "korunka",
  bridge: "můstek",
  arch: "celá čelist",
};

export default function PriceListPage() {
  const perms = usePerms();
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [items, setItems] = useState<PriceListItemRow[]>([]);
  const [categories, setCategories] = useState<PriceListCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Sekvence proti stale odpovědi (rychlé přepnutí archivu → pomalejší
  // starší response nesmí přepsat novější data).
  const fetchSeq = useRef(0);
  const fetchData = useCallback(async (includeArchived: boolean) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const [itemList, catList] = await Promise.all([
        api.get<PriceListItemRow[]>(
          `/price-list-items${includeArchived ? "?includeArchived=1" : ""}`,
        ),
        api.get<PriceListCategory[]>("/price-list-categories"),
      ]);
      if (seq !== fetchSeq.current) return;
      setItems(itemList);
      setCategories(catList);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst ceník"));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(showArchived);
  }, [fetchData, showArchived]);

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
    let result = items.filter(
      (i) =>
        matchesSearchTokens([i.code, i.name, i.shortName], tokens) &&
        (!categoryFilter || i.categoryId === categoryFilter),
    );

    if (sortState.column && sortState.direction) {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortState.column) {
          case "code": aVal = a.code; bVal = b.code; break;
          case "kind": aVal = a.kind ?? ""; bVal = b.kind ?? ""; break;
          case "name": aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
          case "category": aVal = a.categoryName.toLowerCase(); bVal = b.categoryName.toLowerCase(); break;
          case "price": aVal = a.price; bVal = b.price; break;
          case "fee": aVal = a.technicianFee; bVal = b.technicianFee; break;
          default: return 0;
        }
        // numeric localeCompare: „K9" < „K10" (řetězcově by bylo obráceně)
        const cmp =
          typeof aVal === "string" && typeof bVal === "string"
            ? aVal.localeCompare(bVal, "cs", { numeric: true })
            : aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortState.direction === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [items, searchText, categoryFilter, sortState]);

  const columns = [
    {
      key: "code",
      header: t("Kód"),
      width: "10%",
      sortable: true,
      render: (i: PriceListItemRow) => (
        <Text size="sm" fw={600} ff="monospace" style={{ color: "light-dark(#111827, #ececec)" }}>{i.code}</Text>
      ),
    },
    {
      key: "name",
      header: t("Název"),
      sortable: true,
      primary: true,
      render: (i: PriceListItemRow) => (
        <Box>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{i.name}</Text>
            {i.mdrDevice && (
              <Badge size="xs" variant="outline" color="teal">{t("ZP")}</Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">{i.shortName}</Text>
        </Box>
      ),
    },
    {
      key: "kind",
      header: t("Typ"),
      width: "13%",
      sortable: true,
      render: (i: PriceListItemRow) => (
        <Text size="sm" c="dimmed">{t(KIND_LABEL[i.kind ?? "none"])}</Text>
      ),
    },
    {
      key: "category",
      header: t("Kategorie"),
      width: "14%",
      sortable: true,
      mobileHidden: true,
      render: (i: PriceListItemRow) => <Text size="sm" c="dimmed">{i.categoryName}</Text>,
    },
    {
      key: "group",
      header: t("Skupina"),
      width: "12%",
      mobileHidden: true,
      render: (i: PriceListItemRow) =>
        i.groupName ? (
          <Text size="sm" c="dimmed">{i.groupName}</Text>
        ) : (
          <Badge size="sm" variant="light" color="gray">{t("Bez skupiny")}</Badge>
        ),
    },
    {
      key: "price",
      header: t("Cena"),
      width: "11%",
      align: "right" as const,
      sortable: true,
      render: (i: PriceListItemRow) => (
        <Text size="sm" fw={600} style={{ color: "light-dark(#111827, #ececec)" }}>{formatHalere(i.price)}</Text>
      ),
    },
    {
      key: "fee",
      header: t("Odměna"),
      width: "10%",
      align: "right" as const,
      sortable: true,
      mobileHidden: true,
      render: (i: PriceListItemRow) => (
        <Text size="sm" c="dimmed">{formatHalere(i.technicianFee)}</Text>
      ),
    },
    {
      key: "days",
      header: t("Výroba"),
      width: "8%",
      align: "center" as const,
      mobileHidden: true,
      render: (i: PriceListItemRow) => (
        <Text size="sm" c="dimmed">{i.productionDays != null ? t("{n} d", { n: i.productionDays }) : "—"}</Text>
      ),
    },
    ...(showArchived
      ? [
          {
            key: "archived",
            header: t("Stav"),
            width: "10%",
            render: (i: PriceListItemRow) => (
              <Badge size="sm" variant="light" color={i.archived ? "gray" : "green"}>
                {i.archived ? t("Archiv") : t("Aktivní")}
              </Badge>
            ),
          },
        ]
      : []),
  ];

  return (
    <Box style={{ backgroundColor: CRM_TABLE_PAGE_BG, minHeight: "100%" }}>
      <Box p={{ base: 12, sm: 32 }}>
        <Box style={CRM_TABLE_CARD}>
          <PageHeader
            variant="card"
            title={t("Ceník")}
            count={filtered.length}
            primaryAction={!perms.priceListEdit ? undefined : {
              label: t("Nová položka"),
              onClick: () => navigate("/app/price-list/new"),
            }}
            searchPlaceholder={t("Hledat kód nebo název...")}
            searchValue={searchText}
            onSearchChange={setSearchText}
            filters={[
              {
                value: categoryFilter ?? "",
                onChange: (v) => setCategoryFilter(v || null),
                placeholder: t("Kategorie"),
                options: categories.map((c) => ({ value: c.id, label: c.name })),
              },
            ]}
            secondaryActions={
              <Checkbox
                label={t("Zobrazit archivované")}
                checked={showArchived}
                onChange={(e) => setShowArchived(e.currentTarget.checked)}
                size="xs"
              />
            }
          />
          <DataTable
            variant="card"
            columns={columns}
            data={filtered}
            loading={loading}
            emptyMessage={t("Žádné položky. Založ první nebo použij Admin → Import ceníku.")}
            getRowKey={(i) => i.id}
            sortState={sortState}
            onSort={handleSort}
            onRowClick={(i) => navigate(`/app/price-list/${i.id}`)}
          />
        </Box>
      </Box>
    </Box>
  );
}
