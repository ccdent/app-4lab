import { useState } from "react";
import { Checkbox, Stack } from "@mantine/core";
import dayjs from "dayjs";
import FormDateInput from "../form/FormDateInput";
import { t } from "../../i18n";

/** „Neomezená expirace" = systémově dnes + 10 let (DB sloupec zůstává vyplněný). */
export const UNLIMITED_EXPIRATION_YEARS = 10;

interface ExpirationDateInputProps {
  /** 'YYYY-MM-DD' nebo null (viz FormDateInput). */
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

/**
 * Expirace šarže: datum + checkbox „Neexpiruje" pro materiály, které neexpirují
 * (např. titanové premilly). Zaškrtnutí nastaví expiraci na dnes + 10 let —
 * žádný zvláštní NULL režim, zbytek systému (FEFO, expirační kontroly) pracuje
 * s běžným datem.
 *
 * Stav checkboxu je ODVOZENÝ, ne synchronizovaný efektem: pamatujeme si jen
 * přesný řetězec, který jsme při zaškrtnutí vygenerovali (`unlimitedValue`), a
 * checkbox je zaškrtnutý právě když se `value` té hodnotě rovná. Jakákoli změna
 * `value` zvenčí (jiná položka, reset na null, ruční editace) tedy checkbox
 * sama „odškrtne" — bez efektu, který by se dal obejít (viz code review:
 * dřívější `useEffect` reagoval jen na `value === null` a u přechodu mezi dvěma
 * neprázdnými daty checkbox zamrzal zaškrtnutý).
 */
export default function ExpirationDateInput({
  value,
  onChange,
  label,
  required,
  disabled,
  error,
}: ExpirationDateInputProps) {
  // Přesná hodnota, kterou vyrobilo poslední zaškrtnutí. `unlimited` je z ní
  // odvozený porovnáním s aktuálním `value` (jediný zdroj pravdy = value).
  const [unlimitedValue, setUnlimitedValue] = useState<string | null>(null);
  const unlimited = value !== null && value === unlimitedValue;

  return (
    <Stack gap={6}>
      <FormDateInput
        label={label ?? t("Expirace")}
        required={required}
        value={value}
        onChange={onChange}
        disabled={disabled || unlimited}
        error={error}
      />
      <Checkbox
        size="xs"
        label={t("Neexpiruje (nastaví se +{years} let)", { years: UNLIMITED_EXPIRATION_YEARS })}
        checked={unlimited}
        disabled={disabled}
        onChange={(e) => {
          if (e.currentTarget.checked) {
            const next = dayjs().add(UNLIMITED_EXPIRATION_YEARS, "year").format("YYYY-MM-DD");
            setUnlimitedValue(next);
            onChange(next);
          } else {
            setUnlimitedValue(null);
            onChange(null);
          }
        }}
      />
    </Stack>
  );
}
