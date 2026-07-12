/**
 * Demo prostředí = demo.4lab.cz (vlastní worker + D1, sdílená identita).
 * Frontend podle hostname jen upravuje UI (badge, skryté uploady);
 * skutečná omezení vynucuje server (worker/src/demo/guard.ts).
 */
export const IS_DEMO =
  typeof window !== "undefined" && window.location.hostname.startsWith("demo.");
