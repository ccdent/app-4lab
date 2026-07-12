import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  MantineProvider,
  createTheme,
  defaultVariantColorsResolver,
  parseThemeColor,
  type VariantColorsResolver,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import LanguageProvider, { useLanguage } from "./i18n/LanguageProvider";
import "dayjs/locale/cs";
import "dayjs/locale/sk";
import "dayjs/locale/de";
import { tokenOptionsFilter } from "./ui/tokenOptionsFilter";
import ConfirmProvider from "./components/ui/ConfirmProvider";
import AppErrorBoundary from "./components/ui/AppErrorBoundary";
import { DatesProvider } from "@mantine/dates";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/cs";

// Bez customParseFormat dayjs ignoruje formátový řetězec a `dayjs("31.12.2027",
// "DD.MM.YYYY")` spadne na nativní `new Date(...)` → ruční psaní data v
// Mantine `DateInput` parsuje mezistavy chybně (např. „1.1.2001"). Plugin je
// nutný pro správné parsování VŠECH datumových polí (FormDateInput i další).
dayjs.extend(customParseFormat);

import { AuthProvider, useAuth } from "./auth/authContext";
import AppLayout from "./layouts/AppLayout";
import FeedPage from "./pages/feed/FeedPage";
import OrdersPage from "./pages/orders/OrdersPage";
import OrderFormPage from "./pages/orders/OrderFormPage";
import OrderDetailPage from "./pages/orders/OrderDetailPage";
import PrintLabelPage from "./pages/orders/print/PrintLabelPage";
import PrintDeliveryNotePage from "./pages/orders/print/PrintDeliveryNotePage";
import PrintDeclarationPage from "./pages/orders/print/PrintDeclarationPage";
import ClinicsPage from "./pages/clinics/ClinicsPage";
import ClinicFormPage from "./pages/clinics/ClinicFormPage";
import DoctorsPage from "./pages/doctors/DoctorsPage";
import DoctorFormPage from "./pages/doctors/DoctorFormPage";
import PreferenceOptionsPage from "./pages/doctors/PreferenceOptionsPage";
import PriceListPage from "./pages/price-list/PriceListPage";
import PriceListItemFormPage from "./pages/price-list/PriceListItemFormPage";
import CategoriesPage from "./pages/price-list/CategoriesPage";
import GroupsPage from "./pages/price-list/GroupsPage";
import TechniciansPage from "./pages/admin/TechniciansPage";
import LabProfilePage from "./pages/admin/LabProfilePage";
import BillingPage from "./pages/admin/BillingPage";
import ShippingMethodsPage from "./pages/admin/ShippingMethodsPage";
import InstructionsPage from "./pages/admin/InstructionsPage";
import PayrollPage from "./pages/payroll/PayrollPage";
import LandingPage from "./pages/landing/LandingPage";
import PriceListPrintSetupPage from "./pages/price-list/PriceListPrintSetupPage";
import PrintPriceListPage from "./pages/price-list/print/PrintPriceListPage";
import PrintBillingPage from "./pages/admin/PrintBillingPage";
import StockItemsPage from "./pages/materials/StockItemsPage";
import MaterialCatalogPage from "./pages/materials/MaterialCatalogPage";
import RecipeListPage from "./pages/materials/recipes/RecipeListPage";
import RecipeFormPage from "./pages/materials/recipes/RecipeFormPage";
import { lazy, Suspense } from "react";
import { Center, Loader } from "@mantine/core";

// Lazy — exceljs je velká závislost, do hlavního bundle nepatří.
const PriceListImportPage = lazy(() => import("./pages/admin/PriceListImportPage"));
// Lazy — Tiptap editor je velký a potřebuje ho jen administrace návodů.
const InstructionFormPage = lazy(() => import("./pages/admin/InstructionFormPage"));

// app.4lab.cz – theme převzatý z referenční plné verze (crm-mvp)
// Desktop CRM Comfortable Density: teal primary, bez stínů, 44px inputy, 4px grid
/**
 * Lime "light" varianta má defaultně lime text na skoro bílém podkladu —
 * na bílé kartě nečitelné. Zvýrazněný podklad + tmavě olivový text (dark
 * režim zrcadlově). Outline totéž: tmavší text, ať drží kontrast.
 */
const variantColorResolver: VariantColorsResolver = (input) => {
  const defaults = defaultVariantColorsResolver(input);
  const parsed = parseThemeColor({
    color: input.color || input.theme.primaryColor,
    theme: input.theme,
  });
  if (parsed.isThemeColor && parsed.color === "teal") {
    if (input.variant === "light") {
      return {
        ...defaults,
        background: "light-dark(rgba(198, 241, 53, 0.35), rgba(198, 241, 53, 0.12))",
        hover: "light-dark(rgba(198, 241, 53, 0.55), rgba(198, 241, 53, 0.22))",
        color: "light-dark(#465807, #D3EC55)",
      };
    }
    if (input.variant === "outline") {
      return {
        ...defaults,
        color: "light-dark(#5F7A0A, #D3EC55)",
        border: "1px solid #7E9B12",
      };
    }
  }
  return defaults;
};

/** Kalendáře/datumovky v jazyce UI (dayjs locale importované staticky). */
function LocalizedDatesProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage();
  const locale = lang === "en" ? "en" : lang;
  return (
    <DatesProvider settings={{ locale, firstDayOfWeek: 1 }}>{children}</DatesProvider>
  );
}

const theme = createTheme({
  variantColorResolver,
  // Nová identita 2026-07: lime + černá. Klíč zůstává "teal" (celá appka
  // používá color="teal" props) — přemapovaný na brand lime škálu.
  primaryColor: "teal",
  // primaryShade 5 = filled prvky v jasné brand lime (#C6F135, černý text
  // přes autoContrast); odstíny 6+ ztmavené do olivy kvůli čitelnosti
  // light/outline variant (text na světlém podkladu).
  primaryShade: 5,
  autoContrast: true,
  luminanceThreshold: 0.4,
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  fontSizes: {
    xs: "14px",
    sm: "15px",
    md: "16px",
    lg: "18px",
    xl: "20px",
  },
  defaultRadius: "6px",
  cursorType: "pointer",
  focusRing: "never",
  colors: {
    teal: [
      "#FAFDEB",
      "#F3F9D0",
      "#E9F5A8",
      "#DEF07D",
      "#D3EC55",
      "#C6F135",
      "#7E9B12",
      "#5F7A0A",
      "#465807",
      "#2E3A04",
    ],
    // Standardní pořadí světlá→tmavá — Mantine z něj v dark režimu odvozuje
    // barvy variant (subtle/light); flip palety by je rozbil. Sekundární texty
    // proto používají c="dimmed" (adaptivní), ne c="gray.X".
    gray: [
      "#f9fafb", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af",
      "#6b7280", "#4b5563", "#374151", "#1f2937", "#111827",
    ],
  },
  shadows: {
    xs: "none",
    sm: "none",
    md: "none",
    lg: "none",
    xl: "none",
  },
  headings: {
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "1.75rem", lineHeight: "1.3" },
      h2: { fontSize: "1.5rem", lineHeight: "1.3" },
      h3: { fontSize: "1.25rem", lineHeight: "1.35" },
      h4: { fontSize: "1.125rem", lineHeight: "1.4" },
      h5: { fontSize: "1rem", lineHeight: "1.45" },
    },
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
  },
  components: {
    Paper: {
      defaultProps: {
        shadow: "none",
      },
      styles: {
        root: {
          borderRadius: "6px",
        },
      },
    },
    Card: {
      defaultProps: {
        shadow: "none",
      },
      styles: {
        root: {
          borderRadius: "6px",
        },
      },
    },
    Button: {
      defaultProps: {
        size: "md",
        radius: "6px",
      },
      styles: {
        root: {
          fontWeight: 500,
          fontSize: "16px",
          height: "44px",
        },
      },
    },
    Badge: {
      defaultProps: {
        size: "md",
        radius: "xl",
      },
      styles: {
        root: {
          fontWeight: 500,
          fontSize: "0.9375rem",
          textTransform: "none",
          padding: "5px 12px",
          height: "auto",
        },
      },
    },
    Table: {
      styles: {
        table: {
          fontSize: "1.0625rem",
        },
        thead: {
          backgroundColor: "light-dark(#f9fafb, #191919)",
        },
        th: {
          fontWeight: 600,
          fontSize: "0.9375rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "light-dark(#4b5563, #b5b5b5)",
          padding: "14px 16px",
          borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
        },
        td: {
          padding: "14px 16px",
          borderBottom: "1px solid light-dark(#f3f4f6, #2a2a2a)",
          color: "light-dark(#1f2937, #e0e0e0)",
        },
        tr: {
          "&:hover": {
            backgroundColor: "light-dark(#fafbfc, #1c1c1c)",
          },
        },
      },
    },
    TextInput: {
      defaultProps: {
        size: "md",
      },
      styles: {
        input: {
          height: "44px",
          fontSize: "16px",
          borderRadius: "6px",
        },
        label: {
          fontWeight: 500,
          fontSize: "15px",
          color: "light-dark(#374151, #cfcfcf)",
          marginBottom: "4px",
        },
      },
    },
    Select: {
      defaultProps: {
        size: "md",
        // Token + diakritika-insensitive hledání jako default pro VŠECHNY searchable
        // Select (uplatní se jen při `searchable`; explicitní `filter` na konkrétním
        // selectu má přednost).
        filter: tokenOptionsFilter,
      },
      styles: {
        input: {
          height: "44px",
          fontSize: "16px",
          borderRadius: "6px",
        },
        label: {
          fontWeight: 500,
          fontSize: "15px",
          color: "light-dark(#374151, #cfcfcf)",
          marginBottom: "4px",
        },
      },
    },
    Textarea: {
      defaultProps: {
        size: "md",
      },
      styles: {
        input: {
          fontSize: "16px",
          borderRadius: "6px",
        },
        label: {
          fontWeight: 500,
          fontSize: "15px",
          color: "light-dark(#374151, #cfcfcf)",
          marginBottom: "4px",
        },
      },
    },
    NumberInput: {
      defaultProps: {
        size: "md",
      },
      styles: {
        input: {
          height: "44px",
          fontSize: "16px",
          borderRadius: "6px",
        },
      },
    },
    // DateInput — same comfortable 44px sizing as TextInput/Select/NumberInput.
    // Without this override, Mantine v8 DateInput uses default size "sm" (~30px),
    // creating visual inconsistency when placed next to TextInput in the same row.
    DateInput: {
      defaultProps: {
        size: "md",
      },
      styles: {
        input: {
          height: "44px",
          fontSize: "16px",
          borderRadius: "6px",
        },
        label: {
          fontWeight: 500,
          fontSize: "15px",
          color: "light-dark(#374151, #cfcfcf)",
          marginBottom: "4px",
        },
      },
    },
    // MultiSelect — pozor: `minHeight` (ne fixní height), pole roste s pilulkami.
    MultiSelect: {
      defaultProps: {
        size: "md",
        filter: tokenOptionsFilter,
      },
      styles: {
        input: {
          minHeight: "44px",
          fontSize: "16px",
          borderRadius: "6px",
        },
        label: {
          fontWeight: 500,
          fontSize: "15px",
          color: "light-dark(#374151, #cfcfcf)",
          marginBottom: "4px",
        },
      },
    },
    ActionIcon: {
      defaultProps: {
        size: "md",
        radius: "6px",
      },
    },
    Anchor: {
      styles: {
        root: {
          color: "var(--mantine-color-teal-7)",
          fontWeight: 500,
          "&:hover": {
            color: "var(--mantine-color-teal-8)",
          },
        },
      },
    },
  },
});

/** Admin sekce jen pro vedoucí — technika přesměruje na feed. */
function RequireLead({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  if (me.role !== "lead") return <Navigate to="/app/feed" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <LanguageProvider>
      <LocalizedDatesProvider>
        <Notifications position="top-right" />
        <ConfirmProvider />
        {/* Root ochranná síť — místo bílé stránky chybová karta. */}
        <AppErrorBoundary variant="fullscreen">
            <BrowserRouter>
              <Routes>
                {/* Veřejná landing — mimo AuthProvider (anonym nesmí spouštět /me). */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/app" element={<AuthProvider><AppLayout /></AuthProvider>}>
                  <Route index element={<Navigate to="/app/feed" replace />} />
                  <Route path="feed" element={<FeedPage />} />

                  {/* Zakázky */}
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/new" element={<OrderFormPage />} />
                  <Route path="orders/:id/edit" element={<OrderFormPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />

                  {/* Adresář */}
                  <Route path="clinics" element={<ClinicsPage />} />
                  <Route path="clinics/new" element={<ClinicFormPage />} />
                  <Route path="clinics/:id" element={<ClinicFormPage />} />
                  <Route path="doctors" element={<DoctorsPage />} />
                  <Route path="doctors/new" element={<DoctorFormPage />} />
                  <Route path="doctors/preferences" element={<PreferenceOptionsPage />} />
                  <Route path="doctors/:id" element={<DoctorFormPage />} />

                  {/* Ceník */}
                  <Route path="price-list" element={<PriceListPage />} />
                  <Route path="price-list/new" element={<PriceListItemFormPage />} />
                  <Route path="price-list/categories" element={<CategoriesPage />} />
                  <Route path="price-list/groups" element={<GroupsPage />} />
                  <Route path="price-list/print" element={<PriceListPrintSetupPage />} />
                  <Route path="price-list/:id" element={<PriceListItemFormPage />} />

                  {/* Materiály (MDR) */}
                  <Route path="materials" element={<StockItemsPage />} />
                  <Route path="materials/catalog" element={<MaterialCatalogPage />} />
                  <Route path="materials/recipes" element={<RecipeListPage />} />
                  <Route path="materials/recipes/new" element={<RecipeFormPage />} />
                  <Route path="materials/recipes/:id" element={<RecipeFormPage />} />

                  {/* Vyúčtování */}
                  <Route path="payroll" element={<PayrollPage />} />

                  {/* Admin */}
                  <Route path="admin/lab" element={<RequireLead><LabProfilePage /></RequireLead>} />
                  <Route path="admin/technicians" element={<RequireLead><TechniciansPage /></RequireLead>} />
                  <Route path="admin/billing" element={<RequireLead><BillingPage /></RequireLead>} />
                  <Route path="admin/shipping" element={<RequireLead><ShippingMethodsPage /></RequireLead>} />
                  <Route path="admin/instructions" element={<RequireLead><InstructionsPage /></RequireLead>} />
                  <Route
                    path="admin/instructions/:id"
                    element={
                      <Suspense fallback={<Center py={80}><Loader color="teal" /></Center>}>
                        <RequireLead><InstructionFormPage /></RequireLead>
                      </Suspense>
                    }
                  />
                  <Route
                    path="admin/import/price-list"
                    element={
                      <Suspense fallback={<Center py={80}><Loader color="teal" /></Center>}>
                        <RequireLead><PriceListImportPage /></RequireLead>
                      </Suspense>
                    }
                  />

                  {/* Neznámá cesta pod /app → feed (místo prázdné stránky). */}
                  <Route path="*" element={<Navigate to="/app/feed" replace />} />
                </Route>

                {/* Print routes — BEZ app layoutu (pravidlo projektu). */}
                <Route path="/app/orders/:id/print/label" element={<AuthProvider><PrintLabelPage /></AuthProvider>} />
                <Route path="/app/orders/:id/print/delivery-note" element={<AuthProvider><PrintDeliveryNotePage /></AuthProvider>} />
                <Route path="/app/orders/:id/print/declaration" element={<AuthProvider><PrintDeclarationPage /></AuthProvider>} />
                <Route path="/app/admin/billing/print" element={<AuthProvider><PrintBillingPage /></AuthProvider>} />
                <Route path="/app/price-list/print/:doctorId" element={<AuthProvider><PrintPriceListPage /></AuthProvider>} />

                <Route path="*" element={<Navigate to="/app/feed" replace />} />
              </Routes>
            </BrowserRouter>
        </AppErrorBoundary>
      </LocalizedDatesProvider>
      </LanguageProvider>
    </MantineProvider>
  );
}
