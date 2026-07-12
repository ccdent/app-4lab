const CZK_WHOLE = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const CZK_DECIMAL = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formát CZK, např. „8 500 Kč"; necelé částky s 2 desetinnými místy
 * („100,50 Kč") — zaokrouhlení by nesedělo s dodacím listem.
 */
export function formatCzk(amount: number | string | null | undefined): string {
  const n = Number(amount) || 0;
  const whole = Math.abs(Math.round(n * 100) % 100) === 0;
  return `${(whole ? CZK_WHOLE : CZK_DECIMAL).format(n)} Kč`;
}
