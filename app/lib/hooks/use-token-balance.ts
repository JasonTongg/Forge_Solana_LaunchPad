"use client";

import useSWR from "swr";
import type { Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";

const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

/** Raw base-unit token balance (as bigint) a wallet holds for a specific mint. */
export function useTokenBalance(owner?: Address, mint?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, isLoading, error, mutate } = useSWR(
    owner && mint ? (["token-balance", cluster, owner, mint] as const) : null,
    async ([, , ownerAddress, mintAddress]) => {
      const { value } = await client.rpc
        .getTokenAccountsByOwner(
          ownerAddress,
          { mint: mintAddress },
          { encoding: "jsonParsed" }
        )
        .send();
      if (value.length === 0) return 0n;
      const amount = value[0].account.data.parsed.info.tokenAmount.amount as string;
      return BigInt(amount);
    },
    { refreshInterval: 20_000, revalidateOnFocus: true }
  );

  return { balance: data ?? 0n, isLoading, error, mutate };
}

export type WalletTokenAccount = {
  mint: Address;
  amount: bigint;
};

/** Every SPL token balance a wallet holds (used to cross-reference against Forge tokens). */
export function useWalletTokenAccounts(owner?: Address) {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, isLoading, error, mutate } = useSWR(
    owner ? (["wallet-token-accounts", cluster, owner] as const) : null,
    async ([, , ownerAddress]) => {
      const { value } = await client.rpc
        .getTokenAccountsByOwner(
          ownerAddress,
          { programId: TOKEN_PROGRAM_ADDRESS },
          { encoding: "jsonParsed" }
        )
        .send();

      const accounts: WalletTokenAccount[] = value.map((entry) => {
        const info = entry.account.data.parsed.info;
        return {
          mint: info.mint as Address,
          amount: BigInt(info.tokenAmount.amount as string),
        };
      });
      return accounts.filter((a) => a.amount > 0n);
    },
    { refreshInterval: 20_000, revalidateOnFocus: true }
  );

  return { accounts: data ?? [], isLoading, error, mutate };
}
