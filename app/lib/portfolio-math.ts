import type { Address } from "@solana/kit";
import type { TimedTradeEvent } from "./hooks/use-trade-history";

const LAMPORTS_PER_SOL = 1_000_000_000;

export type PositionStats = {
  tokensHeld: number;
  avgEntryPriceSol: number;
  costBasisSol: number;
  realizedPnlSol: number;
};

/**
 * Weighted-average-cost accounting over one wallet's own trades on a single
 * mint, derived from that curve's on-chain trade history (no separate
 * indexer — this is the same data the Detail page's trade feed already has).
 */
export function computePositionStats(
  trades: TimedTradeEvent[],
  wallet: Address
): PositionStats {
  const own = trades
    .filter((t) => t.trader === wallet)
    .slice()
    .sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));

  let tokensHeld = 0;
  let costBasisLamports = 0;
  let realizedPnlLamports = 0;

  for (const trade of own) {
    const tokenAmount = Number(trade.tokenAmount);
    if (trade.isBuy) {
      costBasisLamports += Number(trade.solAmount);
      tokensHeld += tokenAmount;
    } else {
      const proceeds =
        Number(trade.solAmount) - Number(trade.creatorFee) - Number(trade.protocolFee);
      const avgCost = tokensHeld > 0 ? costBasisLamports / tokensHeld : 0;
      const soldCostBasis = avgCost * tokenAmount;
      realizedPnlLamports += proceeds - soldCostBasis;
      costBasisLamports -= soldCostBasis;
      tokensHeld -= tokenAmount;
    }
  }

  const avgEntryPriceSol =
    tokensHeld > 0 ? costBasisLamports / tokensHeld / LAMPORTS_PER_SOL : 0;

  return {
    tokensHeld,
    avgEntryPriceSol,
    costBasisSol: costBasisLamports / LAMPORTS_PER_SOL,
    realizedPnlSol: realizedPnlLamports / LAMPORTS_PER_SOL,
  };
}

export function sumCreatorFees(trades: TimedTradeEvent[]): bigint {
  return trades.reduce((sum, t) => sum + t.creatorFee, 0n);
}
