import { createEmptyClient } from "@solana/kit";
import { rpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { failoverRpc, getDevnetRpcUrls } from "./rpc-failover";

export type ClusterMoniker = "devnet" | "testnet" | "mainnet" | "localnet";

export const CLUSTERS: ClusterMoniker[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

const CLUSTER_URLS: Record<ClusterMoniker, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

const WS_URLS: Record<ClusterMoniker, string> = {
  devnet: "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet-beta.solana.com",
  localnet: "ws://localhost:8900",
};

export function getClusterUrl(cluster: ClusterMoniker) {
  return CLUSTER_URLS[cluster];
}

export function getClusterWsConfig(cluster: ClusterMoniker) {
  return cluster === "localnet" ? { url: WS_URLS[cluster] } : undefined;
}

export function createSolanaClient(cluster: ClusterMoniker) {
  const wsUrl = WS_URLS[cluster];

  if (cluster === "devnet") {
    // Devnet reads (chart history, holder counts, ...) are the heaviest RPC users in this app,
    // so try dedicated providers first and only fall back to the shared public endpoint.
    return createEmptyClient()
      .use(failoverRpc(getDevnetRpcUrls(), wsUrl))
      .use(rpcAirdrop());
  }

  const url = CLUSTER_URLS[cluster];
  return createEmptyClient()
    .use(rpc(url, { url: wsUrl }))
    .use(rpcAirdrop());
}

export type SolanaClient = ReturnType<typeof createSolanaClient>;
