"use client";

import useSWR from "swr";
import { getBase64Decoder, getBase64Encoder, type Address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import {
  CURVE_DISCRIMINATOR,
  LAUNCHPAD_PROGRAM_ADDRESS,
  getCurveDecoder,
  type Curve,
} from "../../generated/launchpad";

export type Token = Curve & { address: Address };

export function useTokens() {
  const { cluster } = useCluster();
  const client = useSolanaClient();

  const { data, error, isLoading, mutate } = useSWR(
    ["tokens", cluster] as const,
    async () => {
      const discriminatorBase64 = getBase64Decoder().decode(CURVE_DISCRIMINATOR);
      const accounts = await client.rpc
        .getProgramAccounts(LAUNCHPAD_PROGRAM_ADDRESS, {
          encoding: "base64",
          filters: [
            {
              memcmp: {
                offset: 0n,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                bytes: discriminatorBase64 as any,
                encoding: "base64",
              },
            },
          ],
        })
        .send();

      const decoder = getCurveDecoder();
      const base64Encoder = getBase64Encoder();
      return accounts.map(({ pubkey, account }) => {
        const bytes = base64Encoder.encode(account.data[0]);
        const curve = decoder.decode(bytes);
        return { ...curve, address: pubkey } satisfies Token;
      });
    },
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  return { tokens: data ?? [], isLoading, error, mutate };
}
