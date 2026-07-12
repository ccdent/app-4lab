import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  AppShell,
  Box,
  Burger,
  Drawer,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconActivity,
  IconBuildingWarehouse,
  IconClipboardList,
  IconCheck,
  IconLogout,
  IconMoon,
  IconReceipt,
  IconSettings,
  IconStethoscope,
  IconSun,
  IconWallet,
} from "@tabler/icons-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { LANGS, t } from "../i18n";
import { IS_DEMO } from "../lib/demo";
import FlagIcon from "../i18n/FlagIcon";
import { useLanguage } from "../i18n/LanguageProvider";
import type { FC } from "react";
import type { IconProps } from "@tabler/icons-react";
import { useAuth } from "../auth/authContext";
import AppErrorBoundary from "../components/ui/AppErrorBoundary";
import "./AppLayout.css";

/* ------------------------------------------------------------------ */
/*  Navigation config — jedna role, všichni vidí všechno               */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  icon: FC<IconProps>;
  path: string;
  /** Extra path prefixes that also mark this item as active */
  activePrefixes?: string[];
}

interface SubNavSection {
  matchPrefixes: string[];
  items: { label: string; path: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Feed", icon: IconActivity, path: "/app/feed" },
  { label: "Zakázky", icon: IconClipboardList, path: "/app/orders" },
  {
    label: "Doktoři",
    icon: IconStethoscope,
    path: "/app/doctors",
    activePrefixes: ["/app/doctors", "/app/clinics"],
  },
  {
    label: "Ceník",
    icon: IconReceipt,
    path: "/app/price-list",
    activePrefixes: ["/app/price-list"],
  },
  {
    label: "Materiály",
    icon: IconBuildingWarehouse,
    path: "/app/materials",
    activePrefixes: ["/app/materials"],
  },
  {
    label: "Vyúčtování",
    icon: IconWallet,
    path: "/app/payroll",
    activePrefixes: ["/app/payroll"],
  },
  {
    label: "Admin",
    icon: IconSettings,
    path: "/app/admin/lab",
    activePrefixes: ["/app/admin"],
  },
];

const SUBNAV_SECTIONS: SubNavSection[] = [
  {
    matchPrefixes: ["/app/doctors", "/app/clinics"],
    items: [
      { label: "Doktoři", path: "/app/doctors" },
      { label: "Kliniky", path: "/app/clinics" },
      { label: "Preference", path: "/app/doctors/preferences" },
    ],
  },
  {
    matchPrefixes: ["/app/price-list"],
    items: [
      { label: "Ceník", path: "/app/price-list" },
      { label: "Kategorie", path: "/app/price-list/categories" },
      { label: "Skupiny", path: "/app/price-list/groups" },
      { label: "Tisk ceníku", path: "/app/price-list/print" },
    ],
  },
  {
    matchPrefixes: ["/app/materials"],
    items: [
      { label: "Šarže materiálů", path: "/app/materials" },
      { label: "Katalog materiálů", path: "/app/materials/catalog" },
      { label: "Recepty", path: "/app/materials/recipes" },
    ],
  },
  {
    matchPrefixes: ["/app/admin"],
    items: [
      { label: "Laboratoř", path: "/app/admin/lab" },
      { label: "Technici", path: "/app/admin/technicians" },
      { label: "Doprava", path: "/app/admin/shipping" },
      { label: "Návody", path: "/app/admin/instructions" },
      { label: "Fakturace", path: "/app/admin/billing" },
      { label: "Import ceníku", path: "/app/admin/import/price-list" },
    ],
  },
];

function getActiveSubNav(pathname: string): SubNavSection | null {
  return (
    SUBNAV_SECTIONS.find((s) =>
      s.matchPrefixes.some((p) => pathname.startsWith(p)),
    ) ?? null
  );
}

/* ------------------------------------------------------------------ */
/*  SubNav                                                             */
/* ------------------------------------------------------------------ */

function SubNav({
  section,
  pathname,
  navigate,
}: {
  section: SubNavSection;
  pathname: string;
  navigate: (path: string) => void;
}) {
  return (
    <Box
      visibleFrom="sm"
      style={{
        height: 44,
        padding: "0 32px",
        backgroundColor: "light-dark(#ffffff, #1f1f1f)",
        borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
        display: "flex",
        alignItems: "stretch",
        gap: 0,
      }}
    >
      {section.items.map((item) => {
        // Find the longest matching path to avoid prefix collisions
        // (e.g. /app/materials vs /app/materials/catalog)
        const bestMatch = section.items
          .filter((i) => pathname.startsWith(i.path))
          .sort((a, b) => b.path.length - a.path.length)[0];
        const isActive = bestMatch?.path === item.path;
        return (
          <UnstyledButton
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              position: "relative",
              cursor: "pointer",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "#7E9B12" : "light-dark(#6b7280, #9b9b9b)",
                whiteSpace: "nowrap",
              }}
            >
              {t(item.label)}
            </Text>
            {isActive && (
              <Box
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 12,
                  right: 12,
                  height: 2,
                  backgroundColor: "#7E9B12",
                  borderRadius: "1px 1px 0 0",
                }}
              />
            )}
          </UnstyledButton>
        );
      })}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  AppLayout                                                          */
/* ------------------------------------------------------------------ */

export default function AppLayout() {
  const { me } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { lang, setLang } = useLanguage();
  // Vlastní logo laboratoře (Admin → Laboratoř); null = výchozí 4lab.
  const [customLogoTs, setCustomLogoTs] = useState<number | null>(null);
  useEffect(() => {
    const load = () =>
      void api
        .get<{ logoUpdatedAt?: number | null }>("/lab-profile")
        .then((p) => setCustomLogoTs(p.logoUpdatedAt ?? null))
        .catch(() => {});
    load();
    window.addEventListener("lab-logo-changed", load);
    return () => window.removeEventListener("lab-logo-changed", load);
  }, []);
  // Admin je jen pro vedoucí — technikům se položka vůbec nenabízí.
  const navItems = NAV_ITEMS.filter(
    (i) => me.role === "lead" || !i.path.startsWith("/app/admin"),
  );
  const navigate = useNavigate();
  const location = useLocation();

  const activeSubNav = getActiveSubNav(location.pathname);
  const headerHeight = activeSubNav ? 112 : 68;

  // Mobilní navigace (pod breakpointem `sm`): horní nav i subnav jsou skryté,
  // místo nich burger + Drawer se všemi položkami (vč. subnav sekcí).
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);

  const drawerNavigate = (path: string) => {
    closeDrawer();
    navigate(path);
  };

  const isNavActive = (item: NavItem) => {
    if (item.activePrefixes) {
      return item.activePrefixes.some((p) => location.pathname.startsWith(p));
    }
    return location.pathname.startsWith(item.path);
  };

  const initials =
    `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase() || "?";

  // Odhlášení řeší Cloudflare Access (session cookie na doméně), ne aplikace.
  const handleSignOut = () => {
    window.location.assign("/cdn-cgi/access/logout");
  };

  return (
    <AppShell
      header={{ height: { base: 68, sm: headerHeight } }}
      padding={0}
      styles={{
        main: {
          backgroundColor: "light-dark(#f8f9fb, #121212)",
          minHeight: "100vh",
        },
      }}
    >
      <AppShell.Header style={{ border: "none" }}>
        {/* ===== Header — 68px ===== */}
        <Box
          px={{ base: 12, sm: 32 }}
          style={{
            height: 68,
            backgroundColor: "light-dark(#ffffff, #1f1f1f)",
            borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Header Left: Burger (mobil) + Logo + Nav */}
          <Box style={{ display: "flex", alignItems: "center", gap: 24, height: "100%" }}>
            <Burger
              opened={drawerOpened}
              onClick={openDrawer}
              hiddenFrom="sm"
              size="sm"
              aria-label={t("Otevřít menu")}
            />
            <Group gap={8} wrap="nowrap">
              {customLogoTs ? (
                <img
                  src={`/api/lab-profile/logo?v=${customLogoTs}`}
                  alt={t("Logo laboratoře")}
                  style={{ height: 34, maxWidth: 180, objectFit: "contain", display: "block" }}
                />
              ) : (
                <>
              <img src="/brand/4lab-icon.svg" alt="4lab" style={{ height: 34, display: "block" }} />
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "light-dark(#161616, #f2f2f2)",
                  whiteSpace: "nowrap",
                  fontFamily: "'JetBrains Mono','Fira Code',monospace",
                  letterSpacing: "-1px",
                }}
              >
                4lab
              </Text>
                </>
              )}
              {IS_DEMO && (
                <Badge size="sm" variant="filled" color="orange" radius="sm">
                  DEMO
                </Badge>
              )}
            </Group>
            <Box visibleFrom="sm" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {navItems.map((item) => {
                const active = isNavActive(item);
                return (
                  <UnstyledButton
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      height: 40,
                      padding: "0 12px",
                      borderRadius: 8,
                      backgroundColor: active ? "light-dark(#f6fbdc, #252b10)" : "transparent",
                    }}
                  >
                    <item.icon size={18} style={{ color: active ? "light-dark(#161616, #f2f2f2)" : "light-dark(#6b7280, #9b9b9b)" }} />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: active ? 600 : 500,
                        color: active ? "light-dark(#161616, #f2f2f2)" : "light-dark(#4b5563, #b5b5b5)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t(item.label)}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Box>
          </Box>

          {/* Header Right: jazyk + dark/light přepínač + uživatelské menu */}
          <Group gap={4} wrap="nowrap">
          <Menu position="bottom-end" width={180}>
            <Menu.Target>
              <UnstyledButton
                aria-label={t("Jazyk")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: 34,
                  padding: "0 8px",
                  borderRadius: 8,
                  fontSize: 15,
                  color: "light-dark(#4b5563, #d1d5db)",
                }}
              >
                <FlagIcon lang={lang} size={20} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {LANGS.map((l) => (
                <Menu.Item
                  key={l.value}
                  leftSection={<FlagIcon lang={l.value} size={18} />}
                  rightSection={l.value === lang ? <IconCheck size={14} /> : null}
                  aria-current={l.value === lang ? "true" : undefined}
                  fw={l.value === lang ? 700 : 400}
                  onClick={() => setLang(l.value)}
                >
                  {l.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Tooltip label={colorScheme === "dark" ? t("Světlý režim") : t("Tmavý režim")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              style={{ color: "light-dark(#4b5563, #d1d5db)" }}
              onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
            >
              {colorScheme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" width={220}>
            <Menu.Target>
              <UnstyledButton
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 44,
                  padding: "0 8px",
                  borderRadius: 8,
                }}
              >
                <Box
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    backgroundColor: "light-dark(#161616, #f2f2f2)",
                    color: "light-dark(#ffffff, #1f1f1f)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {initials}
                </Box>
                <Text visibleFrom="sm" style={{ fontSize: 15, fontWeight: 500, color: "light-dark(#374151, #cfcfcf)" }}>
                  {me.firstName} {me.lastName}
                </Text>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{me.email}</Menu.Label>
              <Menu.Item
                leftSection={<IconLogout size={16} />}
                onClick={handleSignOut}
              >
                {t("Odhlásit se")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          </Group>
        </Box>

        {activeSubNav && (
          <SubNav
            section={activeSubNav}
            pathname={location.pathname}
            navigate={navigate}
          />
        )}
      </AppShell.Header>

      {/* Mobilní Drawer se všemi položkami vč. subnav sekcí */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size="80%"
        padding="md"
        title="Menu"
        hiddenFrom="sm"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap={4}>
          {navItems.map((item) => {
            const active = isNavActive(item);
            const section =
              SUBNAV_SECTIONS.find((s) =>
                s.matchPrefixes.some((p) =>
                  (item.activePrefixes ?? [item.path]).includes(p),
                ),
              ) ?? null;
            return (
              <Box key={item.path}>
                <UnstyledButton
                  onClick={() => drawerNavigate(item.path)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    backgroundColor: active ? "light-dark(#f6fbdc, #252b10)" : "transparent",
                  }}
                >
                  <item.icon size={20} style={{ color: active ? "light-dark(#161616, #f2f2f2)" : "light-dark(#6b7280, #9b9b9b)" }} />
                  <Text style={{ fontSize: 16, fontWeight: active ? 600 : 500 }}>
                    {t(item.label)}
                  </Text>
                </UnstyledButton>
                {active && section && (
                  <Stack gap={0} pl={42} py={4}>
                    {section.items.map((sub) => (
                      <UnstyledButton
                        key={sub.path}
                        onClick={() => drawerNavigate(sub.path)}
                        style={{ padding: "8px 0" }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            color:
                              location.pathname === sub.path
                                ? "light-dark(#161616, #f2f2f2)"
                                : "light-dark(#6b7280, #9b9b9b)",
                          }}
                        >
                          {t(sub.label)}
                        </Text>
                      </UnstyledButton>
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      </Drawer>

      <AppShell.Main>
        {/* Page-level boundary: spadne jen obsah stránky, chrome přežije;
            key={pathname} → přechod na jinou routu boundary resetuje. */}
        <AppErrorBoundary variant="page" key={location.pathname}>
          <Outlet />
        </AppErrorBoundary>
      </AppShell.Main>
    </AppShell>
  );
}
