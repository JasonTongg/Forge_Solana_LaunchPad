"use client";

import useSWR from "swr";
import type { Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { fetchTradeHistory } from "./use-trade-history";
import { computePositionStats, sumCreatorFees, type PositionStats } from "../portfolio-math";

const BATCH_SIZE = 5;

export type PortfolioPosition = PositionStats & { creatorFeesEarned: bigint };

/**
 * Weighted-average-cost position stats for a wallet across many mints, plus
 * total creator fees earned per mint (for the "My Launches" treasury stat).
 * One SWR entry batching all trade-history fetches — not one hook per mint.
 */
export function usePortfolioPositions(wallet: Address | undefined, mints: Address[]) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const sortedKey = mints.length > 0 ? [...mints].sort().join(",") : null;

  const { data, isLoading, error } = useSWR(
    wallet && sortedKey ? (["portfolio-positions", cluster, wallet, sortedKey] as const) : null,
    async ([, , walletAddress]) => {
      const positions: Record<string, PortfolioPosition> = {};
      for (let i = 0; i < mints.length; i += BATCH_SIZE) {
        const batch = mints.slice(i, i + BATCH_SIZE);
        const batchTrades = await Promise.all(batch.map((m) => fetchTradeHistory(client, m)));
        batch.forEach((m, idx) => {
          positions[m] = {
            ...computePositionStats(batchTrades[idx], walletAddress),
            creatorFeesEarned: sumCreatorFees(batchTrades[idx]),
          };
        });
      }
      return positions;
    },
    { refreshInterval: 30_000 }
  );

  return { positions: data ?? {}, isLoading, error };
}
