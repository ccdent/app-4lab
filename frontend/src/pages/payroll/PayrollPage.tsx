import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconLock, IconWallet } from "@tabler/icons-react";
import dayjs from "dayjs";
import { api, ApiError } from "../../api/client";
import type { PayrollStatus, PayrollView } from "../../api/types";
import { formatHalere } from "../../shared/money";
import { monthLabel, monthOptions } from "../../shared/months";
import FormPageShell from "../../components/ui/FormPageShell";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";
import { IS_DEMO } from "../../lib/demo";

/**
 * Vyúčtování (Odmakáno z crm-full) — podíl technika z obratu.
 * Terminologie závazně: „Podíl z obratu", „Předpokládaný podíl z obratu",
 * „Z toho dokončené / rozpracované" — NENÍ to mzda.
 *
 * Zámek: každé zobrazení chce heslo (drží se jen v paměti otevřené stránky,
 * žádná session) — ochrana proti rychlému pohledu přes rameno, ne security.
 */
export default function PayrollPage() {
  const [status, setStatus] = useState<PayrollStatus | null>(null);
  const [statusError, setStatusError] = useState(false);

  // Nastavení hesla (první přístup)
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);

  // Odemčení + data
  const [password, setPassword] = useState("");
  const [unlockedPassword, setUnlockedPassword] = useState<string | null>(null);
  const [month, setMonth] = useState(dayjs().subtract(1, "month").format("YYYY-MM"));
  const [view, setView] = useState<PayrollView | null>(null);
  /** Měsíc, ke kterému patří zobrazená data (heading nesmí předběhnout fetch). */
  const [loadedMonth, setLoadedMonth] = useState<string>(month);
  const [loadingView, setLoadingView] = useState(false);

  useEffect(() => {
    void api
      .get<PayrollStatus>("/payroll/status")
      .then(setStatus)
      .catch(() => setStatusError(true));
  }, []);

  const fetchView = async (pw: string, m: string) => {
    setLoadingView(true);
    try {
      const data = await api.post<PayrollView>("/payroll/view", { password: pw, month: m });
      setView(data);
      setLoadedMonth(m);
      setUnlockedPassword(pw);
    } catch (err) {
      if (err instanceof ApiError && err.code === "WRONG_PASSWORD") {
        notifyError(t("Nesprávné heslo."));
      } else if (err instanceof ApiError && err.code === "PASSWORD_NOT_SET") {
        // Vedoucí mezitím heslo smazal → zpět na volbu nového.
        notifyError(t("Vedoucí ti heslo smazal — zvol si nové."));
        setStatus((s) => (s ? { ...s, hasPassword: false } : s));
      } else {
        notifyError(err instanceof Error ? err.message : t("Načtení se nepodařilo"));
      }
      setView(null);
      setUnlockedPassword(null);
    } finally {
      setLoadingView(false);
    }
  };

  const setInitialPassword = async () => {
    if (newPassword.length < 4) return notifyError(t("Heslo musí mít aspoň 4 znaky."));
    if (newPassword !== newPassword2) return notifyError(t("Hesla se neshodují."));
    setSettingPassword(true);
    try {
      await api.post("/payroll/password", { password: newPassword });
      notifySuccess(t("Heslo nastaveno."));
      setStatus((s) => (s ? { ...s, hasPassword: true } : s));
      // Rovnou zobrazit — heslo známe z tohoto formuláře.
      await fetchView(newPassword, month);
      setNewPassword("");
      setNewPassword2("");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nastavení se nepodařilo"));
    } finally {
      setSettingPassword(false);
    }
  };

  const changeMonth = (m: string) => {
    setMonth(m);
    if (unlockedPassword) void fetchView(unlockedPassword, m);
  };

  if (statusError) {
    return (
      <FormPageShell title={t("Vyúčtování")} backTo="/app/feed">
        <Alert color="red" variant="light">{t("Nepodařilo se načíst stav — obnov stránku.")}</Alert>
      </FormPageShell>
    );
  }
  if (!status) {
    return (
      <Center py={120}>
        <Loader color="teal" />
      </Center>
    );
  }

  return (
    <FormPageShell title={t("Vyúčtování")} backTo="/app/feed">
      {!status.hasPassword ? (
        /* ---------- První přístup: volba hesla ---------- */
        <Card withBorder maw={520} w="100%" mx="auto" mt={64} p="xl">
          <Group gap={8} mb="xs">
            <IconLock size={20} color="#D97706" />
            <Title order={4}>{t("Nastav si heslo pro Vyúčtování")}</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            {t("Heslo chrání tvůj podíl z obratu před náhodným pohledem — zadává se při každém zobrazení. Když ho zapomeneš, vedoucí ti ho smaže a zvolíš si nové.")}
          </Text>
          <Stack gap="md">
            <PasswordInput
              label={t("Nové heslo")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label={t("Heslo znovu")}
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !settingPassword) void setInitialPassword();
              }}
            />
            <Group justify="flex-end">
              <Button loading={settingPassword} onClick={() => void setInitialPassword()}>
                {t("Nastavit heslo")}
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : !view ? (
        /* ---------- Odemčení ---------- */
        <Card withBorder maw={520} w="100%" mx="auto" mt={64} p="xl">
          <Group gap={8} mb="xs">
            <IconLock size={20} color="#D97706" />
            <Title order={4}>{t("Zadej heslo")}</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            {IS_DEMO
              ? t("V ostré verzi si každý technik zvolí vlastní heslo, které chrání jeho podíl z obratu před náhodným pohledem kolegů — zadává se při každém zobrazení. V demoverzi funguje libovolné heslo.")
              : t("Vyúčtování se zobrazí po zadání tvého hesla.")}
          </Text>
          <Stack gap="md">
            <PasswordInput
              label={t("Heslo")}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password && !loadingView) void fetchView(password, month);
              }}
            />
            <Group justify="flex-end">
              <Button
                loading={loadingView}
                disabled={!password}
                onClick={() => void fetchView(password, month)}
              >
                {t("Zobrazit")}
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : (
        /* ---------- Data ---------- */
        <Stack gap="lg">
          <Card withBorder>
            <Group justify="space-between" wrap="wrap" gap="sm">
              <Group gap="sm">
                <IconWallet size={20} color="#7E9B12" />
                <Title order={4}>{t("Podíl z obratu")}</Title>
                {view.role === "lead" && (
                  <Badge variant="light" color="teal">{t("Vedoucí — všichni technici")}</Badge>
                )}
              </Group>
              <Select
                w={200}
                label={undefined}
                value={month}
                onChange={(v) => v && changeMonth(v)}
                data={monthOptions()}
                allowDeselect={false}
                disabled={loadingView}
              />
            </Group>
            <Text size="xs" c="dimmed" mt={6}>
              {t("Orientační přehled podílu z obratu (odměna položek × počet) — není to mzdový systém. Výkaz za období počítá jen dokončené a vyfakturované zakázky.")}
            </Text>
          </Card>

          {view.technicians.map((tech) => (
            <Card withBorder key={tech.id}>
              <Title order={4} mb="sm">{tech.firstName} {tech.lastName}</Title>

              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                {t("Aktuální měsíc ({month}) — předpoklad", { month: monthLabel(view.currentMonth) })}
              </Text>
              <Group gap="xl" mb="md" wrap="wrap">
                <Box>
                  <Text size="xs" c="dimmed">{t("Z toho dokončené")}</Text>
                  <Text size="lg" fw={700}>{formatHalere(tech.current.done)}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">{t("Z toho rozpracované")}</Text>
                  <Text size="lg" fw={700} c="dimmed">{formatHalere(tech.current.open)}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">{t("Předpokládaný podíl z obratu")}</Text>
                  <Text size="lg" fw={700} c="light-dark(#5F7A0A, #D3EC55)">{formatHalere(tech.current.total)}</Text>
                </Box>
              </Group>

              <Divider mb="md" />
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                {t("Výkaz za období — {month} (dokončené a vyfakturované)", { month: monthLabel(loadedMonth) })}
              </Text>
              {tech.period.orders.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t("Žádné dokončené a vyfakturované zakázky v tomto období.")}
                </Text>
              ) : (
                <>
                  {/* Desktop: tabulka. */}
                  <Box visibleFrom="sm">
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t("Číslo")}</Table.Th>
                          <Table.Th>{t("Pacient")}</Table.Th>
                          <Table.Th>{t("Dokončeno")}</Table.Th>
                          <Table.Th style={{ textAlign: "right" }}>{t("Podíl technika")}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {tech.period.orders.map((o) => (
                          <Table.Tr key={o.orderNumber}>
                            <Table.Td>
                              <Text size="sm" ff="monospace" fw={600}>{o.orderNumber}</Text>
                            </Table.Td>
                            <Table.Td><Text size="sm">{o.patientName}</Text></Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {o.doneAt ? dayjs(o.doneAt).format("D. M. YYYY") : "—"}
                              </Text>
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>
                              <Text size="sm" fw={600}>{formatHalere(o.share)}</Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Box>

                  {/* Mobil: řádkové karty — bez horizontálního skrolování. */}
                  <Stack hiddenFrom="sm" gap={6}>
                    {tech.period.orders.map((o) => (
                      <Box
                        key={o.orderNumber}
                        p="sm"
                        style={{
                          border: "1px solid light-dark(#e5e7eb, #333333)",
                          borderRadius: 8,
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm" ff="monospace" fw={600}>{o.orderNumber}</Text>
                          <Text size="sm" fw={700}>{formatHalere(o.share)}</Text>
                        </Group>
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm" truncate>{o.patientName}</Text>
                          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                            {o.doneAt ? dayjs(o.doneAt).format("D. M. YYYY") : "—"}
                          </Text>
                        </Group>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
              <Group justify="flex-end" mt={8}>
                <Text size="sm" c="dimmed">{t("Podíl z obratu za období")}</Text>
                <Text size="md" fw={700}>{formatHalere(tech.period.total)}</Text>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </FormPageShell>
  );
}
