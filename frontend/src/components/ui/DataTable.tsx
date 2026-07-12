import { Table, Box, Text, Center, Loader, UnstyledButton, Stack, Group } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChevronUp,
  IconChevronDown,
  IconSelector,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import {
  CRM_TABLE_HEADER,
  CRM_TABLE_ROW,
  CRM_TABLE_CELL_PADDING,
  CRM_TABLE_SORT,
} from "../../ui/tableStyles";
import { t } from "../../i18n";

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

interface Column<T> {
  key: string;
  header: string;
  width?: string | number;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  render: (row: T) => ReactNode;
  /** Hlavní titulek karty na mobilu. Default = první sloupec s neprázdným headerem. */
  primary?: boolean;
  /** Skrýt sloupec v mobilním kartovém režimu (mobil = rychlý náhled, ne max info). */
  mobileHidden?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  getRowKey: (row: T) => string;
  selectedRowId?: string;
  onRowClick?: (row: T) => void;
  sortState?: SortState;
  onSort?: (column: string) => void;
  variant?: "default" | "card";
}

/**
 * Hybrid Enterprise v2 DataTable (převzato z referenční plné verze)
 *
 * variant="default" — original compact 44px rows (backward compatible)
 * variant="card"    — CRM list-page style matching OrdersDashboard
 */
export default function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage = t("Žádná data."),
  getRowKey,
  selectedRowId,
  onRowClick,
  sortState,
  onSort,
  variant = "default",
}: DataTableProps<T>) {
  const isCard = variant === "card";
  const isMobile = useMediaQuery("(max-width: 47.99em)") ?? false;

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="sm" color="teal" />
      </Center>
    );
  }

  if (data.length === 0) {
    return (
      <Center py="xl">
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      </Center>
    );
  }

  // ─── Mobilní kartový režim ───────────────────────────────────────────────
  // Tabulky se na ~393px mačkají/scrollují (nepoužitelné). Na mobilu je jiný
  // usecase (rychlý náhled/editace) → každý řádek = karta: titul (primární
  // sloupec) + akce vpravo nahoře + zbývající sloupce jako label/hodnota.
  // Sloupce s prázdným headerem = akce (vpravo nahoře, bez labelu). Sloupce s
  // `mobileHidden` se vynechají.
  if (isMobile) {
    const actionCols = columns.filter((c) => c.header.trim() === "");
    const labeledCols = columns.filter((c) => c.header.trim() !== "");
    const primaryCol =
      labeledCols.find((c) => c.primary) ?? labeledCols[0] ?? columns[0];
    const bodyCols = labeledCols.filter(
      (c) => c !== primaryCol && !c.mobileHidden,
    );

    return (
      <Stack gap="xs" p="sm">
        {data.map((row) => {
          const rowKey = getRowKey(row);
          const isSelected = selectedRowId === rowKey;
          return (
            <Box
              key={rowKey}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              p="sm"
              style={{
                border: "1px solid light-dark(#e5e7eb, #333333)",
                borderRadius: 8,
                backgroundColor: isSelected ? "var(--mantine-color-teal-0)" : "light-dark(#ffffff, #1f1f1f)",
                cursor: onRowClick ? "pointer" : "default",
              }}
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                <Box style={{ minWidth: 0, flex: 1 }}>
                  {primaryCol?.render(row)}
                </Box>
                {actionCols.length > 0 && (
                  <Box
                    style={{ flex: "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Group gap={2} wrap="nowrap" justify="flex-end">
                      {actionCols.map((c) => (
                        <Box key={c.key}>{c.render(row)}</Box>
                      ))}
                    </Group>
                  </Box>
                )}
              </Group>

              {bodyCols.length > 0 && (
                <Stack gap={4} mt={8}>
                  {bodyCols.map((c) => (
                    <Group
                      key={c.key}
                      gap="sm"
                      justify="space-between"
                      wrap="nowrap"
                      align="flex-start"
                    >
                      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                        {c.header}
                      </Text>
                      <Box style={{ minWidth: 0, textAlign: "right" }}>
                        {c.render(row)}
                      </Box>
                    </Group>
                  ))}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>
    );
  }

  const renderSortIcon = (columnKey: string) => {
    if (isCard) {
      if (!sortState || sortState.column !== columnKey) {
        return (
          <IconArrowsSort
            size={CRM_TABLE_SORT.size}
            style={{ color: CRM_TABLE_SORT.inactiveColor, opacity: CRM_TABLE_SORT.inactiveOpacity }}
          />
        );
      }
      if (sortState.direction === "asc") {
        return <IconArrowUp size={CRM_TABLE_SORT.size} style={{ color: CRM_TABLE_SORT.activeColor }} />;
      }
      return <IconArrowDown size={CRM_TABLE_SORT.size} style={{ color: CRM_TABLE_SORT.activeColor }} />;
    }

    // default variant — original icons
    if (!sortState || sortState.column !== columnKey) {
      return <IconSelector size={12} style={{ opacity: 0.4 }} />;
    }
    if (sortState.direction === "asc") {
      return <IconChevronUp size={12} style={{ color: "var(--mantine-color-teal-6)" }} />;
    }
    return <IconChevronDown size={12} style={{ color: "var(--mantine-color-teal-6)" }} />;
  };

  /* ----- card variant styles ----- */
  const cardTableStyles = {
    table: {
      borderCollapse: "collapse" as const,
      width: "100%",
      tableLayout: "fixed" as const,
    },
    thead: {
      backgroundColor: CRM_TABLE_HEADER.backgroundColor,
    },
    th: {
      fontWeight: CRM_TABLE_HEADER.fontWeight,
      fontSize: CRM_TABLE_HEADER.fontSize,
      color: CRM_TABLE_HEADER.color,
      padding: "0",
      borderBottom: CRM_TABLE_HEADER.borderBottom,
      whiteSpace: "nowrap" as const,
      height: CRM_TABLE_HEADER.height,
    },
    td: {
      fontSize: CRM_TABLE_ROW.fontSize,
      padding: CRM_TABLE_CELL_PADDING,
      borderBottom: CRM_TABLE_ROW.borderBottom,
      color: CRM_TABLE_ROW.color,
      height: CRM_TABLE_ROW.height,
      verticalAlign: "middle" as const,
    },
    tr: {
      cursor: onRowClick ? "pointer" : ("default" as const),
      transition: "background-color 0.1s ease",
      "&:hover": {
        backgroundColor: CRM_TABLE_ROW.hoverBg,
      },
      "&:last-of-type td": {
        borderBottom: "none",
      },
    },
  };

  /* ----- default variant styles (original) ----- */
  const defaultTableStyles = {
    table: {
      borderCollapse: "collapse" as const,
      width: "100%",
      tableLayout: "fixed" as const,
    },
    thead: {
      backgroundColor: "light-dark(#f9fafb, #191919)",
    },
    th: {
      fontWeight: 600,
      fontSize: "0.6875rem",
      textTransform: "uppercase" as const,
      letterSpacing: "0.04em",
      color: "light-dark(#6b7280, #9b9b9b)",
      padding: "0",
      borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
      whiteSpace: "nowrap" as const,
      height: "36px",
    },
    td: {
      fontSize: "0.8125rem",
      padding: "0 16px",
      borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)",
      color: "light-dark(#374151, #cfcfcf)",
      height: "44px",
      verticalAlign: "middle" as const,
    },
    tr: {
      cursor: onRowClick ? "pointer" : ("default" as const),
      transition: "background-color 0.1s ease",
      "&:hover": {
        backgroundColor: "light-dark(#fafbfc, #1c1c1c)",
      },
      "&:last-of-type td": {
        borderBottom: "none",
      },
    },
  };

  const tableStyles = isCard ? cardTableStyles : defaultTableStyles;
  const thHeight = isCard ? CRM_TABLE_HEADER.height : 36;
  const thPadding = isCard ? CRM_TABLE_CELL_PADDING : "0 16px";
  // Unify header casing across sortable (rendered in a <button>, which resets
  // text-transform) and non-sortable (rendered in a <div>, which inherits the
  // theme's th { text-transform: uppercase }). Card variant = Title Case
  // (matches OrdersDashboard); default variant = UPPERCASE.
  const headerTextTransform: "none" | "uppercase" = isCard ? "none" : "uppercase";

  const tableContent = (
    <Table
      horizontalSpacing={isCard ? 0 : "md"}
      verticalSpacing={0}
      layout="fixed"
      styles={tableStyles}
    >
      <Table.Thead>
        <Table.Tr>
          {columns.map((col) => (
            <Table.Th
              key={col.key}
              style={{
                width: col.width,
                textAlign: col.align || "left",
              }}
            >
              {col.sortable && onSort ? (
                <UnstyledButton
                  onClick={() => onSort(col.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    width: "100%",
                    height: thHeight,
                    padding: thPadding,
                    cursor: "pointer",
                    justifyContent: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start",
                  }}
                >
                  <span style={{ textTransform: headerTextTransform }}>{col.header}</span>
                  {renderSortIcon(col.key)}
                </UnstyledButton>
              ) : (
                <Box
                  px={isCard ? 24 : 16}
                  style={{ display: "flex", alignItems: "center", height: thHeight, textTransform: headerTextTransform }}
                >
                  {col.header}
                </Box>
              )}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.map((row) => {
          const rowKey = getRowKey(row);
          const isSelected = selectedRowId === rowKey;

          return (
            <Table.Tr
              key={rowKey}
              onClick={() => onRowClick?.(row)}
              style={{
                backgroundColor: isSelected ? "var(--mantine-color-teal-0)" : undefined,
              }}
            >
              {columns.map((col) => (
                <Table.Td
                  key={col.key}
                  style={{ textAlign: col.align || "left" }}
                >
                  {col.render(row)}
                </Table.Td>
              ))}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );

  // Mobil: `.datatable-scroll` (index.css) dá tabulce min-width + horizontální
  // scroll, aby se sloupce nemačkaly/nepřekrývaly. Na desktopu bez efektu.
  const scrollableContent = (
    <div className="datatable-scroll">{tableContent}</div>
  );

  // card variant: no outer wrapper (card is provided by parent)
  if (isCard) {
    return scrollableContent;
  }

  // default variant: original bordered wrapper
  return (
    <Box
      style={{
        border: "1px solid light-dark(#e5e7eb, #333333)",
        borderRadius: "4px",
        overflow: "hidden",
        backgroundColor: "light-dark(#ffffff, #1f1f1f)",
        width: "100%",
      }}
    >
      {scrollableContent}
    </Box>
  );
}
