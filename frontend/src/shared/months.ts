import dayjs from "dayjs";
import { t } from "../i18n";

const MONTH_NAMES = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

/** „YYYY-MM" → „červenec 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${t(MONTH_NAMES[m - 1])} ${y}`;
}

/** Posledních `count` měsíců pro výběr (nejnovější první). */
export function monthOptions(count = 18): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = dayjs().startOf("month");
  for (let i = 0; i < count; i++) {
    const m = d.subtract(i, "month");
    out.push({ value: m.format("YYYY-MM"), label: monthLabel(m.format("YYYY-MM")) });
  }
  return out;
}
