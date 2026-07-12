import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Divider,
  Grid,
  Group,
  Loader,
  Menu,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconCalendarEvent,
  IconChevronDown,
  IconClipboardList,
  IconDental,
  IconHistory,
  IconNote,
  IconNotes,
  IconPencil,
  IconPrinter,
  IconStethoscope,
  IconTrash,
  IconBuilding,
  IconUser,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useMediaQuery } from "@mantine/hooks";
import { api, ApiError } from "../../api/client";
import { doctorDisplayName, type OrderDetail } from "../../api/types";
import { normalizeOralCavityValue } from "../../shared/oralCavity";
import { formatHalere } from "../../shared/money";
import {
  ORDER_STATES,
  STATE_COLOR,
  STATE_LABEL,
  type OrderState,
} from "../../shared/orderStates";
import OralCavityViewer from "../../components/orders/OralCavityViewer";
import OrderAttachmentsCard from "../../components/orders/OrderAttachmentsCard";
import OrderMaterialsSection from "../../components/orders/OrderMaterialsSection";
import OrderRecipeProposalsCard, {
  type ProposalStats,
} from "../../components/orders/OrderRecipeProposalsCard";
import { navrhyLabel } from "../../shared/materials";
import { t } from "../../i18n";
import { confirm } from "../../lib/confirm";
import FormPageShell from "../../components/ui/FormPageShell";
import { notifyError, notifySuccess } from "../../lib/notify";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" py={4}>
      <Text size="sm" c="dimmed">{label}</Text>
      {/* component="div" — value bývá Group/Text a <div> nesmí do <p> (hydration) */}
      <Text component="div" size="sm" fw={500} ta="right" style={{ color: "light-dark(#111827, #ececec)" }}>
        {value ?? "—"}
      </Text>
    </Group>
  );
}

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isMobile = useMediaQuery("(max-width: 47.99em)") ?? false;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [changingState, setChangingState] = useState(false);
  // Materiály: statistiky checklistu (soft gate na Dokončeno) + refetch nonce.
  const [proposalStats, setProposalStats] = useState<ProposalStats | null>(null);
  const [materialsRefreshNonce, setMaterialsRefreshNonce] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setOrder(await api.get<OrderDetail>(`/orders/${id}`));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Zakázka nenalezena"));
      navigate("/app/orders");
    }
  }, [id, navigate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (!order) {
    return (
      <Center py={120}>
        <Loader color="teal" />
      </Center>
    );
  }

  const changeState = async (state: OrderState) => {
    // Soft gate na Dokončeno: nevyřešené návrhy materiálů (1:1 crm-full).
    if (state === "done" && !order.isBilled) {
      if (proposalStats === null) {
        const ok = await confirm({
          title: t("Návrhy materiálů nejsou ověřené"),
          message: t("Nepodařilo se ověřit stav návrhů materiálů z receptů. Opravdu dokončit zakázku?"),
          confirmLabel: t("Dokončit"),
          variant: "danger",
        });
        if (!ok) return;
      } else if (proposalStats.pending > 0) {
        const n = proposalStats.pending;
        const pText =
          n === 1
            ? t("zbývá 1 návrh")
            : n <= 4
              ? t("zbývají {n} {navrhy}", { n, navrhy: t(navrhyLabel(n)) })
              : t("zbývá {n} {navrhy}", { n, navrhy: t(navrhyLabel(n)) });
        // Hard/soft podle nastavení laboratoře (best-effort čtení).
        let enforce = false;
        try {
          const lab = await api.get<{ enforceMaterialProposalsOnDone: boolean }>("/lab-profile");
          enforce = lab.enforceMaterialProposalsOnDone;
        } catch {
          // neznámé nastavení → soft
        }
        if (enforce) {
          const go = await confirm({
            title: t("Nevyřešené návrhy materiálů"),
            message: t("Zakázku nelze dokončit — {pText} z receptů (laboratoř vyžaduje kompletní materiálové složení).", { pText }),
            confirmLabel: t("Přejít na návrhy"),
          });
          if (go) {
            document.getElementById("recipe-proposals-card")?.scrollIntoView({ behavior: "smooth" });
          }
          return;
        }
        const ok = await confirm({
          title: t("Nevyřešené návrhy materiálů"),
          message: t("Materiálové složení není kompletní — {pText} z receptů. Opravdu dokončit zakázku?", { pText }),
          confirmLabel: t("Dokončit"),
          variant: "danger",
        });
        if (!ok) return;
      }
    }
    setChangingState(true);
    try {
      await api.post(`/orders/${order.id}/state`, { state });
      notifySuccess(t("Stav změněn na {stav}.", { stav: t(STATE_LABEL[state]) }));
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError && err.code === "PENDING_MATERIAL_PROPOSALS") {
        notifyError(
          t("Zakázku nelze dokončit — materiálové složení není kompletní (nevyřešené návrhy z receptů). Vyřeš návrhy v sekci Návrhy z receptů."),
        );
      } else {
        notifyError(err instanceof Error ? err.message : t("Změna stavu se nepodařila"));
      }
    } finally {
      setChangingState(false);
    }
  };

  const deleteNote = async (noteId: string, body: string) => {
    const preview = body.length > 60 ? `${body.slice(0, 60)}…` : body;
    const ok = await confirm({
      title: t("Smazat poznámku"),
      message: t('Opravdu smazat poznámku „{preview}“?', { preview }),
      confirmLabel: t("Smazat"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/orders/${order!.id}/notes/${noteId}`);
      notifySuccess(t("Poznámka smazána."));
      await fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Smazání se nepodařilo"));
    }
  };

  const addNote = async () => {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/orders/${order.id}/notes`, { body: noteBody.trim() });
      setNoteBody("");
      await fetchData();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Poznámku se nepodařilo uložit"));
    } finally {
      setSavingNote(false);
    }
  };

  const itemsTotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const billableTotal =
    itemsTotal + order.priceAdjustmentAmount + (order.shippingCharged ? order.shippingPrice : 0);
  const doctorName = doctorDisplayName({
    titlePrefix: order.doctorTitlePrefix,
    firstName: order.doctorFirstName,
    lastName: order.doctorLastName,
  });

  // Materiály zamčené = dokončená nebo vyfakturovaná zakázka.
  const materialsLocked = order.state === "done" || order.isBilled;

  const allowedStates: OrderState[] = order.isBilled
    ? order.state === "done"
      ? ["storno"]
      : order.state === "storno"
        ? ["done"]
        : []
    : ORDER_STATES.filter((s) => s !== order.state);


  // Karty detailu — skládají se do dvou pořadí (mobil = jeden sloupec
  // v pracovním pořadí, desktop = dva nezávislé sloupce).
  const cardPolozky = (
    <Card withBorder>
              <Group gap={8} mb="sm">
                <IconClipboardList size={20} color="#7E9B12" />
                <Title order={4}>{t("Položky")}</Title>
              </Group>
              {order.items.length === 0 ? (
                <Text size="sm" c="dimmed">{t("Žádné položky.")}</Text>
              ) : isMobile ? (
                /* Mobil: stohované řádky místo tabulky (bez h-scrollu). */
                <Stack gap={8}>
                  {order.items.map((i) => (
                    <Box
                      key={i.id}
                      p="sm"
                      style={{ border: "1px solid light-dark(#f3f4f6, #2a2a2a)", borderRadius: 8 }}
                    >
                      <Group gap={6} wrap="wrap" mb={4}>
                        <Text size="sm" ff="monospace" c="dimmed">{i.code}</Text>
                        <Text size="sm" fw={600} style={{ flex: 1, minWidth: 140 }}>
                          {i.name}
                        </Text>
                      </Group>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap={6} wrap="nowrap">
                          {i.localization && (
                            <Badge size="sm" variant="light" color="teal">{i.localization}</Badge>
                          )}
                          {i.mdrDevice && (
                            <Badge size="xs" variant="outline" color="teal">ZP</Badge>
                          )}
                        </Group>
                        <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                          {i.quantity}× {formatHalere(i.unitPrice)} ={" "}
                          <Text component="span" fw={700} c="light-dark(#111827, #ececec)">
                            {formatHalere(i.unitPrice * i.quantity)}
                          </Text>
                        </Text>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("Kód")}</Table.Th>
                      <Table.Th>{t("Název")}</Table.Th>
                      <Table.Th>{t("Lokalizace")}</Table.Th>
                      <Table.Th style={{ textAlign: "center" }}>{t("Počet")}</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>{t("Cena/ks")}</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>{t("Celkem")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {order.items.map((i) => (
                      <Table.Tr key={i.id}>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Text size="sm" ff="monospace">{i.code}</Text>
                            {i.mdrDevice && (
                              <Badge size="xs" variant="outline" color="teal">ZP</Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td><Text size="sm">{i.name}</Text></Table.Td>
                        <Table.Td>
                          {i.localization ? (
                            <Badge size="sm" variant="light" color="teal">{i.localization}</Badge>
                          ) : (
                            <Text size="sm" c="dimmed">—</Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <Text size="sm">{i.quantity}×</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm">{formatHalere(i.unitPrice)}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" fw={600}>{formatHalere(i.unitPrice * i.quantity)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
              <Divider my="sm" />
              <Stack gap={2}>
                {/* Rozpad jen když se fakturovatelná částka liší od součtu
                    položek (sleva/přirážka, účtovaná doprava). */}
                {billableTotal !== itemsTotal && (
                  <>
                    <InfoRow label={t("Součet položek")} value={formatHalere(itemsTotal)} />
                    {order.priceAdjustmentAmount !== 0 && (
                      <InfoRow
                        label={`${t("Úprava ceny")}${order.priceAdjustmentReason ? ` (${order.priceAdjustmentReason})` : ""}`}
                        value={formatHalere(order.priceAdjustmentAmount)}
                      />
                    )}
                    {order.shippingCharged && order.shippingPrice > 0 && (
                      <InfoRow
                        label={`${t("Doprava")}${order.shippingMethodName ? ` — ${order.shippingMethodName}` : ""}`}
                        value={formatHalere(order.shippingPrice)}
                      />
                    )}
                  </>
                )}
                {order.shippingMethodName && !(order.shippingCharged && order.shippingPrice > 0) && (
                  <InfoRow label={t("Doprava")} value={`${order.shippingMethodName} ${t("(neúčtuje se)")}`} />
                )}
                <InfoRow
                  label={t("Celkem")}
                  value={<Text fw={700} size="md">{formatHalere(billableTotal)}</Text>}
                />
              </Stack>
            </Card>
  );
  const cardMapa = (
    <Card withBorder>
              <Group gap={8} mb="sm">
                <IconDental size={20} color="#7E9B12" />
                <Title order={4}>{t("Mapa zubů")}</Title>
              </Group>
              <OralCavityViewer
                value={normalizeOralCavityValue(order.oralCavity?.pickerState)}
              />
              <Group gap="sm" mt="sm">
                <Badge variant="light" color="gray">
                  {order.oralCavity?.colorMode === "SHADE"
                    ? t("Odstín {odstin}", { odstin: order.oralCavity.colorShade ?? "—" })
                    : order.oralCavity?.colorMode === "LAB_TO_CHOOSE"
                      ? t("Výběr barvy v laboratoři")
                      : t("Bez požadavku na barvu")}
                </Badge>
              </Group>
            </Card>
  );
  const cardNavrhy = (
    <OrderRecipeProposalsCard
              orderId={order.id}
              isLocked={materialsLocked}
              isBilled={order.isBilled}
              onMaterialUsageChanged={() => setMaterialsRefreshNonce((n) => n + 1)}
              onProposalStatsChange={setProposalStats}
            />
  );
  const cardMaterialy = (
    <OrderMaterialsSection
              orderId={order.id}
              isLocked={materialsLocked}
              refreshNonce={materialsRefreshNonce}
            />
  );
  const cardZadavatelTerminy = (
    <Grid gutter="lg">
              <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card withBorder h="100%">
              <Group gap={8} mb="sm">
                <IconStethoscope size={20} color="#7E9B12" />
                <Title order={4}>{t("Zadavatel")}</Title>
              </Group>
              {/* Místo textových popisků ikony — zarovnání jako InfoRow. */}
              <Stack gap={2}>
                <Group justify="space-between" wrap="nowrap" py={4}>
                  <IconUser size={16} style={{ color: "light-dark(#6b7280, #9b9b9b)", flexShrink: 0 }} />
                  <Text component="div" size="sm" fw={500} ta="right" style={{ color: "light-dark(#111827, #ececec)" }}>
                    {doctorName}
                  </Text>
                </Group>
                <Group justify="space-between" wrap="nowrap" py={4}>
                  <IconBuilding size={16} style={{ color: "light-dark(#6b7280, #9b9b9b)", flexShrink: 0 }} />
                  <Group gap={6} wrap="nowrap">
                    <Box
                      style={{
                        width: 5,
                        height: 18,
                        borderRadius: 3,
                        backgroundColor: order.clinicColor,
                        flexShrink: 0,
                      }}
                    />
                    <Text size="sm" fw={500} ta="right" style={{ color: "light-dark(#111827, #ececec)" }}>
                      {order.clinicName}
                    </Text>
                  </Group>
                </Group>
              </Stack>
              {order.doctorPreferences.length > 0 && (
                <>
                  <Divider my="sm" />
                  <Text size="xs" fw={600} c="dimmed" mb={6}>{t("PREFERENCE DOKTORA")}</Text>
                  <Group gap={4}>
                    {order.doctorPreferences.map((p) => (
                      <Badge key={p} size="sm" variant="light" color="orange">{p}</Badge>
                    ))}
                  </Group>
                </>
              )}
            </Card>

              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card withBorder h="100%">
              <Group gap={8} mb="sm">
                <IconCalendarEvent size={20} color="#D97706" />
                <Title order={4}>{t("Termíny")}</Title>
              </Group>
              <Stack gap={2}>
                <InfoRow
                  label={t("Dokončení")}
                  value={dayjs(order.completionDueAt).format("D. M. YYYY")}
                />
                {order.tryInDates.length > 0 && (
                  <InfoRow
                    label={t("Zkoušky")}
                    value={order.tryInDates.map((d) => dayjs(d).format("D. M.")).join(", ")}
                  />
                )}
                {order.doneAt && (
                  <InfoRow label={t("Dokončeno")} value={dayjs(order.doneAt).format("D. M. YYYY")} />
                )}
                <InfoRow
                  label={t("Technik")}
                  value={
                    order.technicianFirstName
                      ? `${order.technicianFirstName} ${order.technicianLastName}`
                      : t("Nepřiřazen")
                  }
                />
                <InfoRow label={t("Založeno")} value={dayjs(order.createdAt).format("D. M. YYYY")} />
              </Stack>
              {order.note && (
                <>
                  <Divider my="sm" />
                  <Text size="xs" fw={600} c="dimmed" mb={4}>{t("POZNÁMKA K ZAKÁZCE")}</Text>
                  <Text size="sm">{order.note}</Text>
                </>
              )}
            </Card>

              </Grid.Col>
            </Grid>
  );
  const cardPrilohy = (
    <OrderAttachmentsCard
              orderId={order.id}
              attachments={order.attachments}
              onChanged={() => void fetchData()}
            />
  );
  const cardPoznamky = (
    <Card withBorder>
              <Group gap={8} mb="sm">
                <IconNotes size={20} color="#D97706" />
                <Title order={4}>{t("Interní poznámky")}</Title>
              </Group>
              <Group gap="sm" align="flex-start">
                <Textarea
                  placeholder={t("Nová poznámka...")}
                  autosize
                  minRows={1}
                  style={{ flex: 1 }}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.currentTarget.value)}
                />
                <Button
                  variant="light"
                  leftSection={<IconNote size={16} />}
                  loading={savingNote}
                  disabled={!noteBody.trim()}
                  onClick={() => void addNote()}
                >
                  {t("Přidat")}
                </Button>
              </Group>
              <Stack gap="sm" mt="md">
                {order.notes.map((n) => (
                  <Box key={n.id} p="sm" style={{ backgroundColor: "light-dark(#f9fafb, #191919)", borderRadius: 8 }}>
                    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                      <Text size="sm" style={{ flex: 1, whiteSpace: "pre-wrap" }}>{n.body}</Text>
                      <Tooltip label={t("Smazat poznámku")}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          style={{ flexShrink: 0 }}
                          onClick={() => void deleteNote(n.id, n.body)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      {n.authorFirstName} {n.authorLastName} ·{" "}
                      {dayjs(n.createdAt).format("D. M. YYYY H:mm")}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Card>
  );
  const cardHistorie = (
    <Card withBorder>
              <Group gap={8} mb="sm">
                <IconHistory size={20} style={{ color: "light-dark(#6b7280, #9b9b9b)" }} />
                <Title order={4}>{t("Historie stavů")}</Title>
              </Group>
              {order.stateLog.length === 0 ? (
                <Text size="sm" c="dimmed">{t("Zatím žádné změny.")}</Text>
              ) : (
                <Stack gap="xs">
                  {order.stateLog.map((l) => (
                    <Box key={l.id}>
                      <Group gap={6} wrap="nowrap">
                        <Badge size="xs" variant="light" color={STATE_COLOR[l.fromState]}>
                          {t(STATE_LABEL[l.fromState])}
                        </Badge>
                        <Text size="xs" c="dimmed">→</Text>
                        <Badge size="xs" variant="light" color={STATE_COLOR[l.toState]}>
                          {t(STATE_LABEL[l.toState])}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" mt={2}>
                        {l.changedByFirstName} {l.changedByLastName} ·{" "}
                        {dayjs(l.changedAt).format("D. M. YYYY H:mm")}
                      </Text>
                    </Box>
                  ))}
                </Stack>
              )}
            </Card>
  );

  return (
    <FormPageShell
      title={t("Zakázka {cislo} · {pacient}", { cislo: order.orderNumber, pacient: order.patientName })}
      backTo="/app/orders"
      fullWidth
      actions={
        <Group gap="sm">
          {proposalStats && proposalStats.pending + proposalStats.resolved > 0 && (
            <Badge
              size="lg"
              variant="light"
              color={proposalStats.pending > 0 ? "yellow" : "teal"}
              style={{ cursor: "pointer" }}
              onClick={() =>
                document.getElementById("recipe-proposals-card")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              {t("Materiály")} {proposalStats.resolved}/{proposalStats.pending + proposalStats.resolved}
            </Badge>
          )}
          <Badge size="lg" variant="light" color={STATE_COLOR[order.state]}>
            {t(STATE_LABEL[order.state])}
          </Badge>
          {order.isBilled && (
            <Badge size="lg" variant="outline" color="teal">{t("Fakturováno")}</Badge>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="light" leftSection={<IconPrinter size={16} />}>
                {t("Tisk")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => window.open(`/app/orders/${order.id}/print/label`, "_blank")}>
                {t("Štítek")}
              </Menu.Item>
              <Menu.Item onClick={() => window.open(`/app/orders/${order.id}/print/delivery-note`, "_blank")}>
                {t("Dodací list")}
              </Menu.Item>
              {(() => {
                const hasMdr = order.items.some((i) => i.mdrDevice);
                const item = (
                  <Menu.Item
                    disabled={!hasMdr}
                    onClick={() => window.open(`/app/orders/${order.id}/print/declaration`, "_blank")}
                  >
                    {t("Prohlášení o shodě")}
                  </Menu.Item>
                );
                return hasMdr ? item : (
                  <Tooltip label={t("V zakázce není žádný zdravotnický prostředek.")} position="left">
                    {/* div — Tooltip potřebuje ref i na disabled položce */}
                    <div>{item}</div>
                  </Tooltip>
                );
              })()}
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button
                variant="light"
                rightSection={<IconChevronDown size={16} />}
                loading={changingState}
                disabled={allowedStates.length === 0}
              >
                {t("Změnit stav")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {allowedStates.map((s) => (
                <Menu.Item key={s} onClick={() => void changeState(s)}>
                  {t(STATE_LABEL[s])}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          {!order.isBilled && (
            <Button
              leftSection={<IconPencil size={16} />}
              onClick={() => navigate(`/app/orders/${order.id}/edit`)}
            >
              {t("Upravit")}
            </Button>
          )}
        </Group>
      }
    >
      {isMobile ? (
        <Stack gap="lg">
          {cardZadavatelTerminy}
          {cardPolozky}
          {cardMapa}
          {cardPrilohy}
          {cardPoznamky}
          {cardNavrhy}
          {cardMaterialy}
          {cardHistorie}
        </Stack>
      ) : (
        <Grid gutter="lg">
          <Grid.Col span={7}>
            <Stack gap="lg">
              {cardPolozky}
              {cardMapa}
              {cardNavrhy}
              {cardMaterialy}
            </Stack>
          </Grid.Col>
          <Grid.Col span={5}>
            <Stack gap="lg">
              {cardZadavatelTerminy}
              {cardPrilohy}
              {cardPoznamky}
              {cardHistorie}
            </Stack>
          </Grid.Col>
        </Grid>
      )}
    </FormPageShell>
  );
}
