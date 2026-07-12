import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Card,
  Grid,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import dayjs from "dayjs";
import { api } from "../../api/client";
import { useAuth } from "../../auth/authContext";
import { doctorDisplayName, type OrderListRow } from "../../api/types";
import { OPEN_STATES, STATE_COLOR, STATE_LABEL } from "../../shared/orderStates";
import { greetingForNow, vocativeFirstName } from "../../shared/czechGreeting";
import { notifyError } from "../../lib/notify";
import { t } from "../../i18n";

function OrderRow({ order, onClick }: { order: OrderListRow; onClick: () => void }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid light-dark(#f3f4f6, #2a2a2a)",
      }}
    >
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="sm" ff="monospace" fw={600} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {order.orderNumber}
          </Text>
          <Text size="sm" fw={600} truncate style={{ minWidth: 0 }}>
            {order.patientName}
          </Text>
        </Group>
        <Text size="xs" c="dimmed" truncate>
          {doctorDisplayName({
            titlePrefix: order.doctorTitlePrefix,
            firstName: order.doctorFirstName,
            lastName: order.doctorLastName,
          })}{" "}
          ({order.clinicName})
        </Text>
        {order.itemsSummary && (
          <Text size="xs" c="dimmed" truncate>
            {order.itemsSummary}
          </Text>
        )}
      </Box>
      <Badge size="sm" variant="light" color={STATE_COLOR[order.state]} style={{ flexShrink: 0 }}>
        {t(STATE_LABEL[order.state])}
      </Badge>
    </UnstyledButton>
  );
}

function formatBytesShort(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function FeedPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);

  useEffect(() => {
    void api
      .get<OrderListRow[]>(`/orders?state=${OPEN_STATES.join(",")}`)
      .then(setOrders)
      .catch((e) => notifyError(e instanceof Error ? e.message : t("Načtení feedu selhalo")))
      .finally(() => setLoaded(true));
    // Doplňková info vrstva — chyba se neřeší, badge se prostě neukáže.
    void api
      .get<{ count: number; bytes: number }>("/attachments-usage")
      .then((u) => setStorageBytes(u.bytes))
      .catch(() => {});
  }, []);

  const today = dayjs().format("YYYY-MM-DD");
  const groups = useMemo(() => {
    const overdue = orders.filter((o) => o.completionDueAt < today);
    const dueToday = orders.filter((o) => o.completionDueAt === today);
    const upcoming = orders
      .filter((o) => o.completionDueAt > today)
      .sort((a, b) => a.completionDueAt.localeCompare(b.completionDueAt))
      .slice(0, 8);
    return { overdue, dueToday, upcoming };
  }, [orders, today]);

  const sections: { title: string; color?: string; rows: OrderListRow[]; empty: string }[] = [
    { title: t("Po termínu"), color: "red", rows: groups.overdue, empty: t("Nic po termínu. 👍") },
    { title: t("Dnešní termíny"), color: "orange", rows: groups.dueToday, empty: t("Dnes žádný termín.") },
    { title: t("Nejbližší termíny"), rows: groups.upcoming, empty: t("Žádné rozpracované zakázky.") },
  ];

  return (
    <Box px={{ base: 12, sm: 32 }} py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Title order={1}>
            {/* prázdné jméno → jen pozdrav (bez visící čárky) */}
            {vocativeFirstName(me.firstName)
              ? `${t(greetingForNow())}, ${vocativeFirstName(me.firstName)}.`
              : `${t(greetingForNow())}.`}
          </Title>
          <Group gap="xs">
            {storageBytes !== null && (
              <Badge size="sm" variant="default" c="dimmed">
                {t("Úložiště")}: {formatBytesShort(storageBytes)} / 10 GB
              </Badge>
            )}
            <Badge size="lg" variant="light" color="teal">
              {t("Rozpracováno")}: {orders.length}
            </Badge>
          </Group>
        </Group>

        <Grid gutter="lg">
          {sections.map((s) => (
            <Grid.Col key={s.title} span={{ base: 12, md: 4 }}>
              <Card withBorder h="100%">
                <Group gap={6} mb="sm">
                  <Title order={5}>{s.title}</Title>
                  {s.rows.length > 0 && (
                    <Badge size="sm" variant="light" color={s.color ?? "teal"}>
                      {s.rows.length}
                    </Badge>
                  )}
                </Group>
                {!loaded ? null : s.rows.length === 0 ? (
                  <Text size="sm" c="dimmed">{s.empty}</Text>
                ) : (
                  <Stack gap={6}>
                    {s.rows.map((o) => (
                      <OrderRow key={o.id} order={o} onClick={() => navigate(`/app/orders/${o.id}`)} />
                    ))}
                  </Stack>
                )}
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
}
