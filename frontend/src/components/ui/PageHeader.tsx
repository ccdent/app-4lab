import { Box, Group, Text, Button, TextInput, Select, Badge } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconSearch, IconPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { CRM_TOOLBAR } from "../../ui/tableStyles";
import { t } from "../../i18n";

interface FilterOption {
  value: string;
  label: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: Array<{
    value: string;
    onChange: (value: string | null) => void;
    placeholder: string;
    options: FilterOption[];
  }>;
  activeFilters?: Array<{
    label: string;
    onClear: () => void;
  }>;
  secondaryActions?: ReactNode;
  variant?: "default" | "card";
}

/**
 * Hybrid Enterprise v2 PageHeader (převzato z referenční plné verze)
 *
 * variant="default" — original two-row layout (backward compatible)
 * variant="card"    — single-row 64px toolbar matching OrdersDashboard
 */
export default function PageHeader({
  title,
  subtitle,
  count,
  primaryAction,
  searchPlaceholder = t("Hledat..."),
  searchValue,
  onSearchChange,
  filters,
  activeFilters,
  secondaryActions,
  variant = "default",
}: PageHeaderProps) {
  if (variant === "card") {
    return <CardToolbar {...{
      title, subtitle, count, primaryAction, searchPlaceholder,
      searchValue, onSearchChange, filters, activeFilters, secondaryActions,
    }} />;
  }

  return <DefaultHeader {...{
    title, subtitle, count, primaryAction, searchPlaceholder,
    searchValue, onSearchChange, filters, activeFilters, secondaryActions,
  }} />;
}

/* ------------------------------------------------------------------ */
/*  card variant — single-row toolbar inside a card                    */
/* ------------------------------------------------------------------ */

function CardToolbar({
  title,
  count,
  primaryAction,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  secondaryActions,
}: Omit<PageHeaderProps, "variant" | "subtitle" | "activeFilters">) {
  const isMobile = useMediaQuery("(max-width: 47.99em)") ?? false;
  return (
    <Box
      style={{
        display: "flex",
        // Mobil: vše plná šířka pod sebou (jinak se search/filtry ořezávají).
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "space-between",
        // Desktop: prvky se zalomí pod sebe místo překrývání (title vs. akce).
        flexWrap: "wrap",
        rowGap: isMobile ? 10 : 8,
        minHeight: isMobile ? undefined : CRM_TOOLBAR.height,
        // Mobil: vertikální padding (jinak title lepí nahoru, akce dolů na border).
        padding: isMobile ? "14px 16px" : CRM_TOOLBAR.padding,
        borderBottom: CRM_TOOLBAR.borderBottom,
      }}
    >
      {/* Left: Title + count + search + filters */}
      <Box
        style={{
          display: "flex",
          // Center i na mobilu — jinak se malý count „vznáší" nahoře vedle titulku.
          alignItems: "center",
          gap: isMobile ? 8 : 16,
          rowGap: isMobile ? 10 : 8,
          flexWrap: "wrap",
          minWidth: 0,
          flex: 1,
        }}
      >
        <Text
          fw={CRM_TOOLBAR.titleFontWeight}
          style={{
            fontSize: CRM_TOOLBAR.titleFontSize,
            color: CRM_TOOLBAR.titleColor,
            flexShrink: 0,
          }}
        >
          {title}
        </Text>

        {count !== undefined && (
          <Text size="sm" c="dimmed" fw={500} style={{ flexShrink: 0 }}>
            {count}
          </Text>
        )}

        {onSearchChange && (
          <TextInput
            placeholder={searchPlaceholder}
            leftSection={
              <IconSearch
                size={CRM_TOOLBAR.searchIconSize}
                style={{ color: CRM_TOOLBAR.searchIconColor }}
              />
            }
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            w={isMobile ? "100%" : CRM_TOOLBAR.searchWidth}
            size="sm"
            styles={{
              input: {
                backgroundColor: CRM_TOOLBAR.searchBg,
                border: CRM_TOOLBAR.searchBorder,
                borderRadius: CRM_TOOLBAR.searchBorderRadius,
                height: CRM_TOOLBAR.searchHeight,
                fontSize: CRM_TOOLBAR.searchFontSize,
              },
            }}
          />
        )}

        {filters?.map((filter, index) => (
          <Select
            key={index}
            placeholder={filter.placeholder}
            value={filter.value || null}
            onChange={filter.onChange}
            data={filter.options}
            clearable
            size="sm"
            w={isMobile ? "100%" : undefined}
            styles={{
              input: {
                backgroundColor: CRM_TOOLBAR.filterBg,
                border: CRM_TOOLBAR.filterBorder,
                borderRadius: CRM_TOOLBAR.filterBorderRadius,
                height: CRM_TOOLBAR.filterHeight,
                fontSize: CRM_TOOLBAR.filterFontSize,
              },
            }}
          />
        ))}
      </Box>

      {/* Right: secondary actions + primary CTA.
          Mobil: pod sebe (sloupec), tlačítko plná šířka — checkbox + text tlačítka
          se do jednoho řádku nevejdou a tlačítko se ořízlo. */}
      <Box
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          gap: isMobile ? 10 : 12,
          rowGap: 8,
          flexWrap: "wrap",
          minWidth: 0,
          width: isMobile ? "100%" : undefined,
        }}
      >
        {secondaryActions}
        {primaryAction && (
          <Button
            leftSection={primaryAction.icon || <IconPlus size={14} />}
            onClick={primaryAction.onClick}
            fullWidth={isMobile}
          >
            {primaryAction.label}
          </Button>
        )}
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  default variant — original two-row layout                          */
/* ------------------------------------------------------------------ */

function DefaultHeader({
  title,
  subtitle,
  count,
  primaryAction,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  activeFilters,
  secondaryActions,
}: Omit<PageHeaderProps, "variant">) {
  const hasSecondRow = onSearchChange || filters || activeFilters || secondaryActions;

  return (
    <Box
      style={{
        backgroundColor: "light-dark(#ffffff, #1f1f1f)",
        borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
      }}
    >
      {/* Row 1: Title + Primary CTA */}
      <Box
        px={32}
        py="md"
        style={{
          borderBottom: hasSecondRow ? "1px solid light-dark(#f3f4f6, #2a2a2a)" : "none",
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="sm" align="baseline">
            <Text
              component="h1"
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                color: "light-dark(#111827, #ececec)",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {title}
            </Text>
            {count !== undefined && (
              <Text size="sm" c="dimmed" fw={500}>
                {count === 1 ? t("{count} položka", { count }) : t("{count} položek", { count })}
              </Text>
            )}
            {subtitle && !count && (
              <Text size="sm" c="dimmed">
                {subtitle}
              </Text>
            )}
          </Group>
          {primaryAction && (
            <Button
              leftSection={primaryAction.icon || <IconPlus size={14} />}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          )}
        </Group>
      </Box>

      {/* Row 2: Search + Filters + Secondary Actions */}
      {hasSecondRow && (
        <Box px={32} py="sm">
          <Group justify="space-between" align="center">
            <Group gap="sm">
              {onSearchChange && (
                <TextInput
                  placeholder={searchPlaceholder}
                  leftSection={<IconSearch size={14} style={{ color: "light-dark(#9ca3af, #7a7a7a)" }} />}
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  w={260}
                  styles={{
                    input: {
                      backgroundColor: "light-dark(#f9fafb, #191919)",
                      border: "1px solid light-dark(#e5e7eb, #333333)",
                      "&:focus": {
                        borderColor: "var(--mantine-color-teal-5)",
                        backgroundColor: "light-dark(#ffffff, #1f1f1f)",
                      },
                    },
                  }}
                />
              )}
              {filters?.map((filter, index) => (
                <Select
                  key={index}
                  placeholder={filter.placeholder}
                  value={filter.value || null}
                  onChange={filter.onChange}
                  data={filter.options}
                  clearable
                  w={140}
                  styles={{
                    input: {
                      backgroundColor: "light-dark(#f9fafb, #191919)",
                      border: "1px solid light-dark(#e5e7eb, #333333)",
                    },
                  }}
                />
              ))}
              {activeFilters?.map((filter, index) => (
                <Badge
                  key={index}
                  variant="light"
                  color="teal"
                  size="md"
                  radius="sm"
                  style={{ cursor: "pointer" }}
                  onClick={filter.onClear}
                  rightSection="×"
                >
                  {filter.label}
                </Badge>
              ))}
            </Group>
            {secondaryActions && <Group gap="xs">{secondaryActions}</Group>}
          </Group>
        </Box>
      )}
    </Box>
  );
}
