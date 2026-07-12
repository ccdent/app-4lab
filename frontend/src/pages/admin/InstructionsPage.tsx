import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ActionIcon, Anchor, Badge, Box, Group, Tooltip } from "@mantine/core";
import { IconArchive, IconArchiveOff, IconPencil } from "@tabler/icons-react";
import { api } from "../../api/client";
import type { InstructionRow } from "../../api/types";
import PageHeader from "../../components/ui/PageHeader";
import DataTable from "../../components/ui/DataTable";
import { CRM_TABLE_CARD, CRM_TABLE_PAGE_BG } from "../../ui/tableStyles";
import { notifyError, notifySuccess } from "../../lib/notify";
import { t } from "../../i18n";

/** Admin → Návody: seznam návodů k použití ZP (tisknou se v prohlášení). */
export default function InstructionsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<InstructionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<InstructionRow[]>("/instructions"));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst návody"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggleArchived = async (row: InstructionRow) => {
    const next = !row.archived;
    setTogglingId(row.id);
    try {
      // PATCH mění jen archivaci — žádný read-modify-write celého obsahu
      // (souběžná editace návodu by se jinak tiše přepsala).
      await api.patch(`/instructions/${row.id}/archived`, { archived: next });
      notifySuccess(next ? t("Návod archivován") : t("Návod aktivován"));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, archived: next } : r)));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Nepodařilo se změnit stav"));
    } finally {
      setTogglingId(null);
    }
  };

  const columns = [
    {
      key: "name",
      header: t("Název"),
      primary: true,
      render: (r: InstructionRow) => (
        <Anchor
          component={Link}
          to={`/app/admin/instructions/${r.id}`}
          fw={600}
          size="sm"
          style={{ color: "light-dark(#111827, #ececec)" }}
        >
          {r.name}
        </Anchor>
      ),
    },
    {
      key: "categories",
      header: t("Kategorií"),
      width: "14%",
      align: "center" as const,
      render: (r: InstructionRow) => (
        <Badge size="sm" variant="light" color={r.categoryCount ? "teal" : "gray"}>
          {r.categoryCount}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("Stav"),
      width: "14%",
      align: "center" as const,
      render: (r: InstructionRow) =>
        r.archived ? (
          <Badge size="sm" color="gray" variant="light">
            {t("Archivovaný")}
          </Badge>
        ) : (
          <Badge size="sm" color="teal" variant="light">
            {t("Aktivní")}
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      width: "10%",
      align: "right" as const,
      render: (r: InstructionRow) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label={t("Upravit")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              component={Link}
              to={`/app/admin/instructions/${r.id}`}
            >
              <IconPencil size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={r.archived ? t("Aktivovat") : t("Archivovat (netiskne se)")}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              disabled={togglingId === r.id}
              onClick={() => void toggleArchived(r)}
            >
              {r.archived ? <IconArchiveOff size={18} /> : <IconArchive size={18} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  return (
    <Box style={{ backgroundColor: CRM_TABLE_PAGE_BG, minHeight: "100%" }}>
      <Box p={{ base: 12, sm: 32 }}>
        <Box style={CRM_TABLE_CARD}>
          <PageHeader
            variant="card"
            title={t("Návody")}
            count={rows.length}
            primaryAction={{
              label: t("Nový návod"),
              onClick: () => navigate("/app/admin/instructions/new"),
            }}
          />
          <DataTable
            variant="card"
            columns={columns}
            data={rows}
            loading={loading}
            emptyMessage={t("Žádné návody. Návod se tiskne v prohlášení o shodě u kategorií, kterým ho přiřadíš.")}
            getRowKey={(r) => r.id}
          />
        </Box>
      </Box>
    </Box>
  );
}
