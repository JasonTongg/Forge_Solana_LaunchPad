"use client";

import { useEffect } from "react";
import useSWR from "swr";
import type { Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { fetchMaybeCurve, findCurvePda, type Curve } from "../../generated/launchpad";

export type CurveWithAddress = Curve & { address: Address };

export function useCurve(mint?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, isLoading, error, mutate } = useSWR(
    mint ? (["curve", cluster, mint] as const) : null,
    async ([, , mintAddress]) => {
      const [curveAddress] = await findCurvePda({ mint: mintAddress });
      const account = await fetchMaybeCurve(client.rpc, curveAddress);
      if (!account.exists) return null;
      return { ...account.data, address: curveAddress } satisfies CurveWithAddress;
    },
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  useEffect(() => {
    if (!mint) return;

    const abortController = new AbortController();

    const subscribe = async () => {
      try {
        const [curveAddress] = await findCurvePda({ mint });
        const notifications = await client.rpcSubscriptions
          .accountNotifications(curveAddress, { commitment: "confirmed" })
          .subscribe({ abortSignal: abortController.signal });

        for await (const notification of notifications) {
          void notification;
          void mutate();
        }
      } catch {
        // SWR polling and focus revalidation remain as fallback
      }
    };

    void subscribe();
    return () => abortController.abort();
  }, [mint, client, mutate]);

  return { curve: data ?? null, isLoading, error, mutate };
}
