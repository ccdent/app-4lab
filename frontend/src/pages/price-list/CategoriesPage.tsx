import { useEffect, useState } from "react";
import { Badge, Select, Stack, Text, TextInput } from "@mantine/core";
import { api } from "../../api/client";
import CodebookPage from "../../components/ui/CodebookPage";
import { usePerms } from "../../auth/usePerms";
import type { InstructionRow, PriceListCategory } from "../../api/types";
import { t } from "../../i18n";

export default function CategoriesPage() {
  const perms = usePerms();
  const [instructionOptions, setInstructionOptions] = useState<InstructionRow[]>([]);

  // Návody pro select — nearchivované; chyba se neřeší, select bude prázdný.
  useEffect(() => {
    void api
      .get<InstructionRow[]>("/instructions")
      .then((rows) => setInstructionOptions(rows.filter((r) => !r.archived)))
      .catch(() => {});
  }, []);

  return (
    <CodebookPage<PriceListCategory>
      readOnly={!perms.priceListEdit}
      title={t("Kategorie ceníku")}
      endpoint="/price-list-categories"
      usageHeader={t("Položek")}
      getUsage={(r) => r.itemCount}
      addLabel={t("Nová kategorie")}
      emptyMessage={t("Zatím žádné kategorie.")}
      getLabel={(r) => r.name}
      fieldKeys={["name", "instructionId"]}
      toValues={(r) => ({ name: r.name, instructionId: r.instructionId ?? "" })}
      extraColumn={{
        header: t("Návod k použití"),
        width: "30%",
        render: (r) =>
          r.instructionName ? (
            <Badge size="sm" variant="light" color="teal">
              {r.instructionName}
            </Badge>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          ),
      }}
      renderFields={(values, setValue) => (
        <Stack gap="sm">
          <TextInput
            label={t("Název")}
            required
            value={values.name ?? ""}
            onChange={(e) => setValue("name", e.currentTarget.value)}
            data-autofocus
          />
          <Select
            label={t("Návod k použití")}
            description={t("Tiskne se v prohlášení o shodě u MDR položek této kategorie")}
            placeholder={t("Bez návodu")}
            clearable
            searchable
            value={values.instructionId || null}
            onChange={(v) => setValue("instructionId", v ?? "")}
            data={instructionOptions.map((i) => ({ value: i.id, label: i.name }))}
          />
        </Stack>
      )}
    />
  );
}
