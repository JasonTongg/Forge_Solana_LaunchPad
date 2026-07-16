"use client";

import useSWR from "swr";
import { getAddressDecoder, getBase64Encoder, type Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import type { SolanaClient } from "../solana-client";
import { findCurvePda } from "../../generated/launchpad";

const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const TOKEN_ACCOUNT_SIZE = 165n;
// SPL Token account layout: mint(32) + owner(32) + amount(8) — fetch owner+amount in one slice
// so the curve's own vault (owner == curve PDA) can be excluded from the holder count.
const OWNER_AND_AMOUNT_OFFSET = 32;
const OWNER_AND_AMOUNT_LENGTH = 40;
const BATCH_SIZE = 5;

/** Number of distinct wallets holding a nonzero balance of `mint` (excludes the curve's own vault). */
export async function fetchHolderCount(client: SolanaClient, mint: Address): Promise<number> {
  const [curveAddress] = await findCurvePda({ mint });

  const accounts = await client.rpc
    .getProgramAccounts(TOKEN_PROGRAM_ADDRESS, {
      encoding: "base64",
      dataSlice: { offset: OWNER_AND_AMOUNT_OFFSET, length: OWNER_AND_AMOUNT_LENGTH },
      filters: [
        { dataSize: TOKEN_ACCOUNT_SIZE },
        {
          memcmp: {
            offset: 0n,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            bytes: mint as any,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  const base64Encoder = getBase64Encoder();
  const addressDecoder = getAddressDecoder();
  let holders = 0;
  for (const { account } of accounts) {
    const bytes = base64Encoder.encode(account.data[0]);
    const owner = addressDecoder.decode(bytes.subarray(0, 32));
    if (owner === curveAddress) continue;

    let amount = 0n;
    for (let i = 39; i >= 32; i--) {
      amount = (amount << 8n) | BigInt(bytes[i]);
    }
    if (amount > 0n) holders += 1;
  }
  return holders;
}

export function useHolderCount(mint?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, isLoading, error } = useSWR(
    mint ? (["holder-count", cluster, mint] as const) : null,
    ([, , mintAddress]) => fetchHolderCount(client, mintAddress),
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  return { holders: data ?? null, isLoading, error };
}

/** Sum of holder counts across many mints — one SWR entry, not one hook per token. */
export function useAggregateHolderCount(mints: Address[]) {
  const { cluster } = useCluster();
  const client = useSolanaClient();
  const key = mints.length > 0 ? mints.slice().sort().join(",") : null;

  const { data, isLoading, error } = useSWR(
    key ? (["aggregate-holder-count", cluster, key] as const) : null,
    async () => {
      let total = 0;
      for (let i = 0; i < mints.length; i += BATCH_SIZE) {
        const batch = mints.slice(i, i + BATCH_SIZE);
        const counts = await Promise.all(batch.map((m) => fetchHolderCount(client, m)));
        total += counts.reduce((sum, c) => sum + c, 0);
      }
      return total;
    },
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  return { total: mints.length === 0 ? 0 : (data ?? null), isLoading, error };
}
