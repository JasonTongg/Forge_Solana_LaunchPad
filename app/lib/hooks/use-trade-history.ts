"use client";

import useSWR from "swr";
import type { Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { findCurvePda } from "../../generated/launchpad";
import { extractTradeEvents, type TradeEvent } from "../trade-event";
import type { SolanaClient } from "../solana-client";

export type TimedTradeEvent = TradeEvent & {
  signature: string;
  blockTime: number | null;
};

const BATCH_SIZE = 5;
const DEFAULT_LIMIT = 30;

async function mapWithConcurrency<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

/** Fetches and decodes every TradeEvent for a curve's mint — shared by the
 * per-token hook below and the Portfolio page's cross-mint aggregation. */
export async function fetchTradeHistory(
  client: SolanaClient,
  mint: Address,
  limit = DEFAULT_LIMIT
): Promise<TimedTradeEvent[]> {
  const [curveAddress] = await findCurvePda({ mint });
  const signatures = await client.rpc
    .getSignaturesForAddress(curveAddress, { limit, commitment: "confirmed" })
    .send();

  const successful = signatures.filter((s) => s.err === null);

  const transactions = await mapWithConcurrency([...successful], BATCH_SIZE, (sig) =>
    client.rpc
      .getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
        encoding: "json",
      })
      .send()
      .catch(() => null)
  );

  const trades: TimedTradeEvent[] = [];
  transactions.forEach((tx, i) => {
    if (!tx) return;
    const events = extractTradeEvents(tx.meta?.logMessages ?? null);
    for (const event of events) {
      trades.push({
        ...event,
        signature: successful[i].signature,
        blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
      });
    }
  });

  trades.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
  return trades;
}

export function useTradeHistory(mint?: Address, limit = DEFAULT_LIMIT) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, isLoading, error, mutate } = useSWR(
    mint ? (["trade-history", cluster, mint, limit] as const) : null,
    ([, , mintAddress, sigLimit]) => fetchTradeHistory(client, mintAddress, sigLimit),
    { refreshInterval: 20_000, revalidateOnFocus: true }
  );

  return { trades: data ?? [], isLoading, error, mutate };
}
