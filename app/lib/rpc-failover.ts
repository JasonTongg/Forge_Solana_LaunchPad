import {
  createDefaultRpcTransport,
  createEmptyClient,
  createSolanaRpcFromTransport,
  createSolanaRpcSubscriptions,
  type RpcTransport,
  type TransactionSigner,
} from "@solana/kit";
import { payer } from "@solana/kit-plugin-payer";
import { rpcTransactionPlanExecutor, rpcTransactionPlanner } from "@solana/kit-plugin-rpc";
import { planAndSendTransactions } from "@solana/kit-plugin-instruction-plan";

/**
 * Tries each URL in order, falling back to the next on any failure (network error, 429, 5xx,
 * timeout, ...). Every individual RPC call re-tries the full list from the top, so a transient
 * failure on the primary endpoint doesn't stick around for the rest of the session.
 */
function createFailoverTransport(urls: readonly string[]): RpcTransport {
  if (urls.length === 0) {
    throw new Error("createFailoverTransport requires at least one URL");
  }
  const transports = urls.map((url) => createDefaultRpcTransport({ url }));

  return async function failoverTransport(config) {
    let lastError: unknown;
    for (const transport of transports) {
      try {
        return await transport(config);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  } as RpcTransport;
}

/** Devnet RPC endpoints tried in order, dedicated providers first, public endpoint last. */
export function getDevnetRpcUrls(): string[] {
  const urls = [
    process.env.NEXT_PUBLIC_DEVNET_RPC_1,
    process.env.NEXT_PUBLIC_DEVNET_RPC_2,
    "https://api.devnet.solana.com",
  ].filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
}

/**
 * A `.use()`-compatible plugin — same shape as `@solana/kit-plugin-rpc`'s `rpc()` — except HTTP
 * calls are backed by the failover transport above instead of a single URL.
 */
export function failoverRpc(urls: readonly string[], rpcSubscriptionsUrl: string) {
  const rpc = createSolanaRpcFromTransport(createFailoverTransport(urls));
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl);
  return <T extends object>(client: T) => ({ ...client, rpc, rpcSubscriptions });
}

/**
 * Same capabilities as `@solana/kit-client-rpc`'s `createClient` (a `sendTransaction`-capable
 * client), but composed manually so the RPC reads it does internally (blockhash, simulation,
 * confirmation) also go through the failover transport instead of a single URL.
 */
export function createFailoverSendClient(
  urls: readonly string[],
  rpcSubscriptionsUrl: string,
  signer: TransactionSigner
) {
  return createEmptyClient()
    .use(failoverRpc(urls, rpcSubscriptionsUrl))
    .use(payer(signer))
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanExecutor())
    .use(planAndSendTransactions());
}
