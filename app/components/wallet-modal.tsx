"use client";

import { useWallet } from "../lib/wallet/context";
import { useWalletModal } from "../lib/wallet/modal-context";
import { gradientForAddress } from "../lib/gradient-avatar";
import { ellipsify } from "../lib/explorer";

export function WalletModal() {
  const { isOpen, close } = useWalletModal();
  const { connectors, connect, disconnect, wallet, status } = useWallet();

  if (!isOpen) return null;

  const handleConnect = async (connectorId: string) => {
    try {
      await connect(connectorId);
      close();
    } catch {
      // connection errors surface through wallet context state
    }
  };

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: "rgba(4,5,8,.72)", backdropFilter: "blur(6px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-modalin w-full max-w-[400px] rounded-[20px] border border-border-low bg-popover p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="m-0 text-[19px] font-bold">Connect a wallet</h3>
          <button
            onClick={close}
            aria-label="Close"
            className="cursor-pointer text-xl leading-none text-white/50 hover:text-white"
          >
            ×
          </button>
        </div>
        <p className="mb-4.5 mt-0 text-[13px] text-white/50">
          Choose how you want to connect to Forge.
        </p>

        <div className="flex flex-col gap-2.5">
          {connectors.length === 0 && (
            <p className="rounded-xl border border-border-low bg-white/[0.03] p-4 text-center text-[13px] text-white/50">
              No Solana wallets detected. Install{" "}
              <a
                href="https://phantom.app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Phantom
              </a>{" "}
              or another wallet-standard extension.
            </p>
          )}
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => handleConnect(connector.id)}
              disabled={status === "connecting"}
              className="group flex w-full cursor-pointer items-center gap-3.5 rounded-[13px] border border-border-low bg-white/[0.03] p-3.5 text-left text-white transition hover:border-[rgba(153,69,255,.5)] hover:bg-[rgba(153,69,255,.08)] disabled:opacity-50"
            >
              <div
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-lg"
                style={{ background: gradientForAddress(connector.id) }}
              >
                {connector.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={connector.icon} alt="" className="h-full w-full object-cover" />
                ) : (
                  "◈"
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{connector.name}</div>
                <div className="text-[11.5px] text-white/45">Solana wallet</div>
              </div>
              <span className="text-white/35">→</span>
            </button>
          ))}
        </div>

        {status === "connected" && wallet && (
          <>
            <div className="mt-3.5 rounded-xl border border-border-low bg-white/[0.03] px-3.5 py-3">
              <p className="text-[11px] text-white/45">Connected as</p>
              <p className="font-mono text-[13px]">{ellipsify(wallet.account.address, 4)}</p>
            </div>
            <button
              onClick={async () => {
                await disconnect();
                close();
              }}
              className="mt-2.5 w-full cursor-pointer rounded-xl border border-[rgba(255,77,109,.3)] bg-[rgba(255,77,109,.08)] p-3 text-[13px] font-semibold text-[#ff4d6d]"
            >
              Disconnect
            </button>
          </>
        )}

        <div className="mt-4 text-center text-[11px] text-white/35">
          By connecting you agree to the Terms of Service
        </div>
      </div>
    </div>
  );
}
