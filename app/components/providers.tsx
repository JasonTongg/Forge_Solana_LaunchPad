"use client";

import { Toaster } from "sonner";
import { PropsWithChildren } from "react";
import { ClusterProvider } from "./cluster-context";
import { WalletProvider } from "../lib/wallet/context";
import { WalletModalProvider } from "../lib/wallet/modal-context";
import { SolanaClientProvider } from "../lib/solana-client-context";
import { WalletModal } from "./wallet-modal";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ClusterProvider>
      <SolanaClientProvider>
        <WalletProvider>
          <WalletModalProvider>
            {children}
            <WalletModal />
          </WalletModalProvider>
        </WalletProvider>
      </SolanaClientProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#12131b",
            border: "1px solid rgba(20,241,149,.3)",
            color: "#fff",
          },
        }}
      />
    </ClusterProvider>
  );
}
