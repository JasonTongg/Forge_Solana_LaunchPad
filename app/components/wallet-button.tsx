"use client";

import { useWallet } from "../lib/wallet/context";
import { useWalletModal } from "../lib/wallet/modal-context";
import { ellipsify } from "../lib/explorer";
import { PingDot } from "./ping-dot";

export function WalletButton() {
  const { wallet, status } = useWallet();
  const { open } = useWalletModal();

  if (status === "connected" && wallet) {
    return (
      <button
        onClick={open}
        className="flex cursor-pointer items-center gap-2.5 rounded-[11px] border border-[rgba(153,69,255,.3)] bg-[rgba(153,69,255,.12)] px-3.5 py-2.5 text-[12.5px] font-medium"
      >
        <PingDot size={7} color="#b98cff" />
        <span className="font-mono text-[#e4d4ff]">{ellipsify(wallet.account.address, 4)}</span>
      </button>
    );
  }

  return (
    <button
      onClick={open}
      className="cursor-pointer whitespace-nowrap rounded-[11px] border-0 px-4.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(153,69,255,.35)]"
      style={{ background: "linear-gradient(135deg,#9945ff,#7d2dff)" }}
    >
      Connect Wallet
    </button>
  );
}
