/**
 * Shared CRM list-page table style tokens.
 *
 * Every value is extracted from OrdersDashboard.tsx — the reference
 * list-page design. See the plan file for line-by-line provenance.
 */

/* ------------------------------------------------------------------ */
/*  Card container (wraps toolbar + table)                             */
/* ------------------------------------------------------------------ */

export const CRM_TABLE_CARD = {
  backgroundColor: "light-dark(#ffffff, #1f1f1f)",
  borderRadius: 12,
  border: "1px solid light-dark(#f3f4f6, #2a2a2a)",
  boxShadow: "0 2px 6px #0000000A",
  overflow: "hidden" as const,
} as const;

/**
 * Content / detail card — same chrome as CRM_TABLE_CARD (border, radius,
 * soft shadow) but with inner padding and no overflow clipping. Use for
 * detail-page sections instead of hand-rolled inline cardStyle objects.
 */
export const CRM_CONTENT_CARD = {
  backgroundColor: "light-dark(#ffffff, #1f1f1f)",
  borderRadius: 12,
  border: "1px solid light-dark(#f3f4f6, #2a2a2a)",
  boxShadow: "0 2px 6px #0000000A",
  padding: 24,
} as const;

/**
 * Teal accent used across CRM tables/tokens. NOTE: this exact shade is the
 * CRM brand accent and is intentionally NOT one of the Mantine `teal.*`
 * theme shades — use this token instead of hardcoding the hex.
 */
export const CRM_ACCENT = "#7E9B12";

/* ------------------------------------------------------------------ */
/*  Page background                                                    */
/* ------------------------------------------------------------------ */

export const CRM_TABLE_PAGE_BG = "light-dark(#f8f9fb, #121212)";

/* ------------------------------------------------------------------ */
/*  Toolbar (inside the card, above the header row)                    */
/* ------------------------------------------------------------------ */

export const CRM_TOOLBAR = {
  height: 64,
  padding: "0 24px",
  borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
  titleFontSize: 24,
  titleFontWeight: 600,
  titleColor: "light-dark(#111827, #ececec)",
  searchWidth: 300,
  searchBg: "light-dark(#f3f4f6, #2a2a2a)",
  searchBorder: "none",
  searchBorderRadius: 8,
  searchHeight: 42,
  searchFontSize: 16,
  searchIconSize: 18,
  searchIconColor: "light-dark(#9ca3af, #7a7a7a)",
  filterBg: "light-dark(#ffffff, #1f1f1f)",
  filterBorder: "1px solid light-dark(#e5e7eb, #333333)",
  filterBorderRadius: 8,
  filterHeight: 42,
  filterFontSize: 16,
} as const;

/* ------------------------------------------------------------------ */
/*  Column header row                                                  */
/* ------------------------------------------------------------------ */

export const CRM_TABLE_HEADER = {
  height: 46,
  backgroundColor: "light-dark(#f9fafb, #191919)",
  borderBottom: "2px solid light-dark(#e5e7eb, #333333)",
  fontSize: 15,
  fontWeight: 600,
  color: "light-dark(#9ca3af, #7a7a7a)",
  activeColor: "#7E9B12",
} as const;

/* ------------------------------------------------------------------ */
/*  Data rows                                                          */
/* ------------------------------------------------------------------ */

export const CRM_TABLE_ROW = {
  height: 56,
  fontSize: 16,
  color: "light-dark(#374151, #cfcfcf)",
  borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)",
  hoverBg: "light-dark(#fafbfc, #1c1c1c)",
} as const;

export const CRM_TABLE_CELL_PADDING = "0 24px";

/* ------------------------------------------------------------------ */
/*  Sort icons                                                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Form page layout                                                   */
/* ------------------------------------------------------------------ */

export const CRM_FORM_MAX_WIDTH = 1150;

/* ------------------------------------------------------------------ */
/*  Sort icons                                                         */
/* ------------------------------------------------------------------ */

export const CRM_TABLE_SORT = {
  size: 16,
  inactiveColor: "light-dark(#9ca3af, #7a7a7a)",
  inactiveOpacity: 0.5,
  activeColor: "#7E9B12",
} as const;

/* ------------------------------------------------------------------ */
/*  Page-level outer padding (around table card)                       */
/* ------------------------------------------------------------------ */

export const CRM_PAGE_PADDING = 32;

/* ------------------------------------------------------------------ */
/*  Pagination footer (custom CRM list-page paginace)                  */
/* ------------------------------------------------------------------ */

export const CRM_PAGINATION = {
  footerHeight: 54,
  footerPadding: "0 24px",
  gap: 8,
  buttonHeight: 36,
  buttonPadding: "0 14px",
  buttonBorderRadius: 6,
  buttonBorder: "1px solid light-dark(#e5e7eb, #333333)",
  buttonGap: 5,
  buttonFontSize: 16,
  buttonFontWeight: 500,
  buttonColor: "light-dark(#4b5563, #b5b5b5)",
  chevronSize: 17,
  chevronColor: "light-dark(#9ca3af, #7a7a7a)",
  disabledOpacity: 0.4,
  pageNumberSize: 36,
  pageNumberBorderRadius: 6,
  pageNumberFontSize: 16,
  pageNumberActiveBg: "#7E9B12",
  pageNumberActiveColor: "#fff",
  pageNumberActiveFontWeight: 600,
  pageNumberInactiveColor: "light-dark(#4b5563, #b5b5b5)",
  pageNumberInactiveFontWeight: 500,
  dotsColor: "light-dark(#9ca3af, #7a7a7a)",
  dotsFontSize: 16,
  dotsFontWeight: 500,
  countTextFontSize: 16,
  countTextColor: "light-dark(#4b5563, #b5b5b5)",
  emptyTextFontSize: 16,
  emptyTextColor: "light-dark(#9ca3af, #7a7a7a)",
} as const;

/* ------------------------------------------------------------------ */
/*  Filter chip (status pill in Orders toolbar)                        */
/* ------------------------------------------------------------------ */

export const CRM_FILTER_CHIP = {
  height: 36,
  padding: "0 14px",
  borderRadius: 18,
  gap: 6,
  fontSize: 15,
  fontWeight: 400,
  dimmedOpacity: 0.55,
  transition: "all 0.15s ease",
  activeOutlineWidth: 2,
  activeOutlineOffset: -1,
} as const;
