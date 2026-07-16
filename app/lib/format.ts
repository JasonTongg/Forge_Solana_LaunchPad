const SOL_SYMBOL = "◎"; // ◎

export function formatSol(amountInSol: number, maxDecimals = 4): string {
  if (!Number.isFinite(amountInSol)) return "0";
  return amountInSol.toLocaleString("en-US", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  });
}

export function formatPriceSol(amountInSol: number): string {
  // Token prices can be tiny (billions of tokens against a small starting market cap), so this
  // needs more precision than typical SOL-amount displays or it just shows "0".
  return `${formatSol(amountInSol, 9)} ${SOL_SYMBOL}`;
}

/** Compact number formatting: 412000 -> "412K", 1200000 -> "1.2M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function formatUsd(n: number): string {
  return `$${formatCompact(n)}`;
}

export function formatTokenAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Enough decimal places to show at least 2 significant digits of a percentage — a deep pool
 * (large starting market cap relative to trade size) can make price impact or "% sold" genuinely
 * tiny (e.g. 0.00007%). Fixed 1-2 decimal formatting would show that as a misleading flat "0.00%";
 * this proves it's nonzero instead.
 */
function adaptivePctDecimals(magnitude: number): number {
  if (magnitude === 0) return 2;
  return Math.min(8, Math.max(2, 2 - Math.floor(Math.log10(magnitude))));
}

/** Signed percent (price impact, change since launch). */
export function formatImpactPct(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0.00%";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(adaptivePctDecimals(Math.abs(n)))}%`;
}

/** Unsigned percent (e.g. "% sold"). */
export function formatPct(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0%";
  return `${n.toFixed(adaptivePctDecimals(Math.abs(n)))}%`;
}

export function formatAge(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo`;
  return `${Math.floor(diffMonth / 12)}y`;
}
