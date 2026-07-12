import { type CSSProperties } from "react";
import { DateInput } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";
import dayjs from "dayjs";
import type { Density } from "../../ui/density";
import { useDensity, getDensityRecipe, mergeDensityStyles } from "../../ui/density";
import { t } from "../../i18n";

/**
 * Parser ručního (klávesnicového) vstupu: český zápis den.měsíc.rok s 1–2
 * cifernými dnem/měsícem a volitelnými mezerami po tečkách — akceptuje
 * „10.5.2027", „10.05.2027" i „10. 5. 2027".
 *
 * Mantine default parser zkouší striktní formát `DD.MM.YYYY` a při
 * jednociferném dni/měsíci propadne na nativní `new Date(...)`, které řetězec
 * čte AMERICKY (měsíc.den.rok) → „10.5.2027" tiše nastaví 5. října 2027.
 * Proto vlastní parser bez `new Date()` fallbacku: nekompletní/neplatný vstup
 * vrací null (hodnota se nenastaví), validita data se ověřuje striktně
 * (31.2. neprojde).
 */
function parseCzechDateInput(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return dayjs(iso, "YYYY-MM-DD", true).isValid() ? iso : null;
}

interface FormDateInputProps {
  /** Controlled value as 'YYYY-MM-DD' string or null */
  value: string | null;
  /** Called with 'YYYY-MM-DD' string or null when date changes */
  onChange: (value: string | null) => void;
  label?: string;
  description?: string;
  required?: boolean;
  /** Earliest selectable date (Date object or 'YYYY-MM-DD' string) */
  minDate?: Date | string;
  /** Latest selectable date (Date object or 'YYYY-MM-DD' string) */
  maxDate?: Date | string;
  clearable?: boolean;
  disabled?: boolean;
  error?: string;
  /** Explicit density override. Falls back to DensityProvider context. */
  density?: Density;
  /** Additional Mantine styles — merged with density recipe (overrides win). */
  styles?: Record<string, CSSProperties>;
}

/**
 * Sdílený date picker obalující Mantine v8 DateInput.
 *
 * V Mantine v8 DateInput pracuje nativně s 'YYYY-MM-DD' string hodnotami
 * (DateStringValue), takže žádná extra konverze string<->Date není potřeba.
 * Timezone drift řeší volající kód (viz src/shared/dates.ts).
 */
export default function FormDateInput({
  value,
  onChange,
  label,
  description,
  required,
  minDate,
  maxDate,
  clearable = true,
  disabled,
  error,
  density: densityProp,
  styles,
}: FormDateInputProps) {
  const ctxDensity = useDensity();
  const density = densityProp ?? ctxDensity;
  const recipe = getDensityRecipe("DateInput", density);

  // Bez explicit `size` fallbacku: undefined nechá Mantine theme default „md" (44px)
  // — sjednocené s TextInput/Select/NumberInput. Pro compact density recipe vrátí
  // „sm" a aplikuje vlastní 32px styles (viz docs/ui/SIZING_GUIDELINE.md).
  return (
    <DateInput
      size={recipe?.size}
      valueFormat="DD.MM.YYYY"
      dateParser={parseCzechDateInput}
      // Enter potvrdí ručně napsané datum: blur → Mantine fixOnBlur hodnotu
      // přeformátuje a zavře kalendářový dropdown (bez nutnosti klikat myší
      // vedle). preventDefault, ať Enter neodešle okolní formulář.
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder={t("DD.MM.RRRR")}
      leftSection={<IconCalendar size={14} />}
      value={value}
      onChange={onChange}
      label={label}
      description={description}
      required={required}
      minDate={minDate}
      maxDate={maxDate}
      clearable={clearable}
      disabled={disabled}
      error={error}
      styles={mergeDensityStyles(recipe, styles)}
    />
  );
}
