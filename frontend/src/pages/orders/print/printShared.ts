// =============================================================================
// Sdílené prvky tiskových stránek: fetch dat, formátování, print tlačítko.
// Tisk = window.print() + @media print (žádná PDF knihovna) — pravidlo projektu.
// =============================================================================

import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { OrderDetail } from "../../../api/types";
import { t } from "../../../i18n";

export interface LabProfile {
  name: string;
  /** Tisky v jazyce aplikace (nastavení Admin → Laboratoř); false = vždy česky. */
  printInAppLanguage: boolean;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string | null;
  phone: string | null;
  email: string | null;
}

export function useOrderPrintData(orderId: string | undefined) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [lab, setLab] = useState<LabProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    void Promise.all([
      api.get<OrderDetail>(`/orders/${orderId}`),
      api.get<LabProfile>("/lab-profile"),
    ])
      .then(([o, l]) => {
        setOrder(o);
        setLab(l);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Načtení selhalo"));
  }, [orderId]);

  return { order, lab, error };
}

export type PrintT = (cs: string, vars?: Record<string, string | number>) => string;

/**
 * Překladač tisků: zapnuto = jazyk aplikace (t), vypnuto = vždy čeština
 * (klíč = český zdrojový text, jen se dosadí placeholdery).
 */
export function makePrintT(inAppLanguage: boolean): PrintT {
  if (inAppLanguage) return t;
  return (cs, vars) =>
    !vars ? cs : cs.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** „DD. MM. RRRR" z ISO data nebo unix ms. */
export function formatDateCS(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}. ${get("month")}. ${get("year")}`;
}

/** Částka v Kč (z haléřů), bez „Kč" — šablony si měnu dopisují samy. */
export function formatCZK(halere: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(halere / 100);
}

export function labAddress(lab: LabProfile): string {
  return [lab.street, [lab.zip, lab.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}


/** Datum výroby dokumentu: done_at, jinak termín dokončení (vzor crm-mvp). */
export function manufactureDate(order: OrderDetail): string {
  return formatDateCS(order.doneAt ?? order.completionDueAt);
}
