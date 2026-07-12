// Stavy zakázky — jediný zdroj pravdy pro labely a barvy badge.

export type OrderState = "new" | "accepted" | "in_progress" | "try_in" | "done" | "storno";

export const ORDER_STATES: OrderState[] = [
  "new",
  "accepted",
  "in_progress",
  "try_in",
  "done",
  "storno",
];

export const STATE_LABEL: Record<OrderState, string> = {
  new: "Nová",
  accepted: "Přijatá",
  in_progress: "Ve výrobě",
  try_in: "Na zkoušce",
  done: "Hotová",
  storno: "Storno",
};

export const STATE_COLOR: Record<OrderState, string> = {
  new: "blue",
  accepted: "cyan",
  in_progress: "yellow",
  try_in: "grape",
  done: "green",
  storno: "gray",
};

/** Otevřené stavy (rozpracováno) — default filtr seznamu. */
export const OPEN_STATES: OrderState[] = ["new", "accepted", "in_progress", "try_in"];
