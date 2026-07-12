import { TextInput } from "@mantine/core";
import CodebookPage from "../../components/ui/CodebookPage";
import type { ShippingMethodRow } from "../../api/types";
import { t } from "../../i18n";

/** Číselník způsobů dopravy — cena se zadává až na zakázce. */
export default function ShippingMethodsPage() {
  return (
    <CodebookPage<ShippingMethodRow>
      title={t("Způsoby dopravy")}
      endpoint="/shipping-methods"
      usageHeader={t("Zakázek")}
      getUsage={(r) => r.orderCount}
      addLabel={t("Nový způsob dopravy")}
      emptyMessage={t("Zatím žádné způsoby dopravy (např. Osobní odběr, Svoz, Pošta…).")}
      getLabel={(r) => r.name}
      fieldKeys={["name"]}
      toValues={(r) => ({ name: r.name })}
      renderFields={(values, setValue) => (
        <TextInput
          label={t("Název")}
          required
          placeholder={t("Např. Osobní odběr / Svoz laboratoří / Zásilkovna")}
          value={values.name ?? ""}
          onChange={(e) => setValue("name", e.currentTarget.value)}
          data-autofocus
        />
      )}
    />
  );
}
