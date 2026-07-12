import { useState } from "react";
import {
  Box,
  Button,
  Card,
  Group,
  List,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconArrowRight, IconCheck, IconLock, IconMail } from "@tabler/icons-react";
import { Badge } from "@mantine/core";
import { IS_DEMO } from "../../lib/demo";

// =============================================================================
// Veřejná uvítací stránka (root domény, BEZ Cloudflare Access i bez auth
// kontextu) — plně vlastní vzhled ve 4 jazycích. „Přihlásit se" teprve vede
// do /app, kde přístup řeší Access (e-mail → jednorázový kód).
// =============================================================================

type Lang = "cs" | "sk" | "en" | "de";

const LANG_KEY = "landing-lang";

const T: Record<Lang, {
  headline: string;
  sub: string;
  loginTitle: string;
  steps: [string, string, string];
  note: string;
  cta: string;
  privacy: string;
}> = {
  cs: {
    headline: "Systém zubní laboratoře 4lab",
    sub: "Evidence zakázek, materiálů a MDR dokumentace pro naši laboratoř a spolupracující ordinace.",
    loginTitle: "Jak se přihlásíte",
    steps: [
      "Klikněte na Přihlásit se a zadejte svůj pracovní e-mail.",
      "Do e-mailu vám přijde jednorázový přihlašovací kód.",
      "Kód opíšete a jste uvnitř — bez hesla, bez registrace.",
    ],
    note: "Přístup mají pouze e-mailové adresy schválené laboratoří.",
    cta: "Přihlásit se",
    privacy: "Interní systém — přístup jen pro pověřené osoby.",
  },
  sk: {
    headline: "Systém zubného laboratória 4lab",
    sub: "Evidencia zákaziek, materiálov a MDR dokumentácie pre naše laboratórium a spolupracujúce ordinácie.",
    loginTitle: "Ako sa prihlásite",
    steps: [
      "Kliknite na Prihlásiť sa a zadajte svoj pracovný e-mail.",
      "Do e-mailu vám príde jednorazový prihlasovací kód.",
      "Kód odpíšete a ste vnútri — bez hesla, bez registrácie.",
    ],
    note: "Prístup majú iba e-mailové adresy schválené laboratóriom.",
    cta: "Prihlásiť sa",
    privacy: "Interný systém — prístup len pre poverené osoby.",
  },
  en: {
    headline: "4lab Dental Laboratory System",
    sub: "Order tracking, materials and MDR documentation for our laboratory and partner practices.",
    loginTitle: "How to sign in",
    steps: [
      "Click Sign in and enter your work e-mail address.",
      "You will receive a one-time login code by e-mail.",
      "Type in the code and you are in — no password, no registration.",
    ],
    note: "Access is limited to e-mail addresses approved by the laboratory.",
    cta: "Sign in",
    privacy: "Internal system — authorized personnel only.",
  },
  de: {
    headline: "4lab Dentallabor-System",
    sub: "Auftragsverwaltung, Materialien und MDR-Dokumentation für unser Labor und Partnerpraxen.",
    loginTitle: "So melden Sie sich an",
    steps: [
      "Klicken Sie auf Anmelden und geben Sie Ihre Arbeits-E-Mail ein.",
      "Sie erhalten einen Einmalcode per E-Mail.",
      "Code eingeben und Sie sind drin — ohne Passwort, ohne Registrierung.",
    ],
    note: "Zugang nur für vom Labor freigegebene E-Mail-Adressen.",
    cta: "Anmelden",
    privacy: "Internes System — nur für befugte Personen.",
  },
};

function initialLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "cs" || saved === "sk" || saved === "en" || saved === "de") return saved;
  return "cs";
}

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = T[lang];

  const changeLang = (v: string) => {
    const next = v as Lang;
    setLang(next);
    localStorage.setItem(LANG_KEY, next);
  };

  return (
    <Box
      mih="100vh"
      style={{
        background: "linear-gradient(180deg, light-dark(#f6fbdc, #252b10) 0%, light-dark(#f8f9fb, #121212) 40%)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Group justify="space-between" px={{ base: 16, sm: 40 }} py="md">
        <Group gap={10}>
          <img
            src="/brand/4lab-logo.svg"
            alt="4lab"
            style={{ height: 44, display: "block" }}
          />
          {IS_DEMO && (
            <Badge size="lg" variant="filled" color="orange" radius="sm">
              DEMO
            </Badge>
          )}
        </Group>
        <SegmentedControl
          size="xs"
          value={lang}
          onChange={changeLang}
          data={[
            { value: "cs", label: "CZ" },
            { value: "sk", label: "SK" },
            { value: "en", label: "EN" },
            { value: "de", label: "DE" },
          ]}
        />
      </Group>

      {/* Content */}
      <Box style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }} px={16} py={32}>
        <Stack gap="xl" maw={560} w="100%">
          <Stack gap={8} align="center">
            <Title order={1} ta="center" style={{ color: "light-dark(#161616, #f2f2f2)" }}>
              {t.headline}
            </Title>
            <Text ta="center" c="dimmed" size="lg">
              {t.sub}
            </Text>
          </Stack>

          <Card withBorder radius={12} p="xl">
            <Group gap={8} mb="md">
              <ThemeIcon variant="light" color="teal" size="lg" radius="xl">
                <IconLock size={18} />
              </ThemeIcon>
              <Title order={3}>{t.loginTitle}</Title>
            </Group>
            {IS_DEMO && (
              <Text size="sm" c="dimmed" mb="sm">
                {"Toto je veřejná ukázka se vzorovými daty — přihlášení je na jedno kliknutí, bez e-mailu. Data se každou noc resetují."}
              </Text>
            )}
            <List
              spacing="sm"
              icon={
                <ThemeIcon variant="light" color="teal" size={24} radius="xl">
                  <IconCheck size={14} />
                </ThemeIcon>
              }
            >
              {t.steps.map((s, i) => (
                <List.Item key={i}>
                  <Text size="sm">{s}</Text>
                </List.Item>
              ))}
            </List>
            <Group gap={8} mt="md" wrap="nowrap">
              <IconMail size={16} style={{ color: "light-dark(#6b7280, #9b9b9b)", flexShrink: 0 }} />
              <Text size="xs" c="dimmed">{t.note}</Text>
            </Group>
            <Button
              fullWidth
              mt="xl"
              size="lg"
              rightSection={<IconArrowRight size={18} />}
              // PLNÉ načtení dokumentu (ne SPA navigate) — jen tak může
              // Cloudflare Access zachytit request a provést přihlášení.
              onClick={() => window.location.assign("/app/feed")}
            >
              {t.cta}
            </Button>
          </Card>

          <Text ta="center" size="xs" c="dimmed">
            {t.privacy} · 4lab
          </Text>
        </Stack>
      </Box>
    </Box>
  );
}
