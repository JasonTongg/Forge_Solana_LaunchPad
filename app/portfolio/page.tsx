"use client";

import { useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { useWallet } from "../lib/wallet/context";
import { useWalletModal } from "../lib/wallet/modal-context";
import { useTokens, type Token } from "../lib/hooks/use-tokens";
import { useWalletTokenAccounts } from "../lib/hooks/use-token-balance";
import { usePortfolioPositions } from "../lib/hooks/use-portfolio-positions";
import { priceInSol, marketCapUsd, toWholeTokens } from "../lib/bonding-curve";
import { formatPriceSol, formatTokenAmount, formatUsd } from "../lib/format";
import { gradientForAddress } from "../lib/gradient-avatar";

export default function PortfolioPage() {
  const { wallet, status } = useWallet();
  const { open: openWalletModal } = useWalletModal();
  const { tokens } = useTokens();
  const walletAddress = wallet?.account.address;
  const { accounts } = useWalletTokenAccounts(walletAddress);

  const tokensByMint = useMemo(() => {
    const map = new Map<string, Token>();
    for (const t of tokens) map.set(t.mint, t);
    return map;
  }, [tokens]);

  const holdings = useMemo(
    () => accounts.filter((a) => tokensByMint.has(a.mint)).map((a) => ({ ...a, token: tokensByMint.get(a.mint)! })),
    [accounts, tokensByMint]
  );

  const launches = useMemo(
    () => tokens.filter((t) => t.creator === walletAddress),
    [tokens, walletAddress]
  );

  const allMints = useMemo(() => {
    const set = new Set<string>([...holdings.map((h) => h.mint), ...launches.map((l) => l.mint)]);
    return Array.from(set) as Address[];
  }, [holdings, launches]);

  const { positions } = usePortfolioPositions(walletAddress, allMints);

  if (status !== "connected") {
    return (
      <div className="mx-auto max-w-[1240px] px-8 py-24 text-center">
        <div
          className="mx-auto mb-5.5 h-[72px] w-[72px] rotate-45 rounded-[22px] shadow-[0_0_40px_rgba(153,69,255,.4)]"
          style={{ background: "linear-gradient(135deg,#9945ff,#14f195)" }}
        />
        <h2 className="m-0 text-[26px] font-bold">Connect your wallet</h2>
        <p className="mx-auto my-2.5 max-w-[380px] text-[15px] text-white/50">
          Connect a Solana wallet to see your holdings, launches and profit &amp; loss.
        </p>
        <button
          onClick={openWalletModal}
          className="cursor-pointer rounded-[13px] border-0 px-6.5 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_28px_rgba(153,69,255,.4)]"
          style={{ background: "linear-gradient(135deg,#9945ff,#7d2dff)" }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const totalValue = holdings.reduce((sum, h) => {
    const price = priceInSol(h.token.virtualSolReserves, h.token.virtualTokenReserves);
    return sum + toWholeTokens(h.amount) * price;
  }, 0);
  const totalUnrealizedPnl = holdings.reduce((sum, h) => {
    const price = priceInSol(h.token.virtualSolReserves, h.token.virtualTokenReserves);
    const value = toWholeTokens(h.amount) * price;
    const costBasis = positions[h.mint]?.costBasisSol ?? 0;
    return sum + (value - costBasis);
  }, 0);

  const summary = [
    { label: "Total value", value: formatPriceSol(totalValue), color: "#fff" },
    { label: "Tokens owned", value: String(holdings.length), color: "#fff" },
    { label: "Launched projects", value: String(launches.length), color: "#fff" },
    {
      label: "Unrealized P&L",
      value: `${totalUnrealizedPnl >= 0 ? "+" : ""}${formatPriceSol(totalUnrealizedPnl)}`,
      color: totalUnrealizedPnl >= 0 ? "#14f195" : "#ff4d6d",
    },
  ];

  const handleShare = async (mint: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/token/${mint}`);
    toast.success("Share link copied to clipboard");
  };

  return (
    <div className="animate-fadeup mx-auto max-w-[1240px] px-8 pb-[70px] pt-10">
      <div className="mb-6.5">
        <h1 className="m-0 text-[34px] font-bold tracking-tight">Portfolio</h1>
        <p className="mt-2 font-mono text-[13px] text-white/50">{walletAddress}</p>
      </div>

      <div className="mb-7.5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border-low bg-white/[0.03] p-5">
            <div className="mb-2.5 text-[12.5px] text-white/50">{s.label}</div>
            <div className="font-mono text-[26px] font-bold" style={{ color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl border border-input bg-card p-5">
        <div className="mb-4 text-lg font-bold">My Holdings</div>
        {holdings.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">
            You don&apos;t hold any Forge tokens yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1fr] gap-3 border-b border-border-low pb-3 text-[10.5px] uppercase tracking-wide text-white/40">
              <span>Token</span>
              <span>Balance</span>
              <span>Value</span>
              <span>Avg entry</span>
              <span className="text-right">P&amp;L</span>
            </div>
            {holdings.map((h) => {
              const price = priceInSol(h.token.virtualSolReserves, h.token.virtualTokenReserves);
              const value = toWholeTokens(h.amount) * price;
              const pos = positions[h.mint];
              const pnl = pos ? value - pos.costBasisSol + pos.realizedPnlSol : 0;
              const pnlPct = pos && pos.costBasisSol > 0 ? (pnl / pos.costBasisSol) * 100 : 0;
              return (
                <Link
                  key={h.mint}
                  href={`/token/${h.mint}`}
                  className="grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1fr] items-center gap-3 border-b border-white/[0.04] py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-[34px] w-[34px] shrink-0 rounded-[9px]"
                      style={{ background: gradientForAddress(h.mint) }}
                    />
                    <div>
                      <div className="text-sm font-semibold">{h.token.name}</div>
                      <div className="font-mono text-[11px] text-white/40">${h.token.symbol}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[13px]">{formatTokenAmount(toWholeTokens(h.amount))}</span>
                  <span className="font-mono text-[13px] font-semibold">{formatPriceSol(value)}</span>
                  <span className="font-mono text-[13px] text-white/60">
                    {pos && pos.avgEntryPriceSol > 0 ? pos.avgEntryPriceSol.toFixed(6) : "—"}
                  </span>
                  <span
                    className="text-right font-mono text-[13px] font-bold"
                    style={{ color: pnl >= 0 ? "#14f195" : "#ff4d6d" }}
                  >
                    {pnlPct >= 0 ? "+" : ""}
                    {pnlPct.toFixed(0)}%
                  </span>
                </Link>
              );
            })}
          </>
        )}
      </div>

      <div className="mb-4 text-lg font-bold">My Launches</div>
      {launches.length === 0 ? (
        <p className="rounded-2xl border border-input bg-card py-10 text-center text-sm text-white/45">
          You haven&apos;t launched a token yet.{" "}
          <Link href="/create" className="underline">
            Create one
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {launches.map((l) => {
            const price = priceInSol(l.virtualSolReserves, l.virtualTokenReserves);
            const mcap = marketCapUsd(l.virtualSolReserves, l.virtualTokenReserves, l.tokenTotalSupply);
            const treasury = positions[l.mint]?.creatorFeesEarned ?? 0n;
            return (
              <div key={l.mint} className="overflow-hidden rounded-2xl border border-input bg-card">
                <div className="h-14" style={{ background: gradientForAddress(l.mint) }} />
                <div className="px-4 pb-4">
                  <div
                    className="-mt-6 mb-2.5 h-12 w-12 rounded-[13px] border-[3px] border-card"
                    style={{ background: gradientForAddress(l.mint) }}
                  />
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="text-base font-bold">{l.name}</span>
                    <span className="font-mono text-xs text-white/45">${l.symbol}</span>
                  </div>
                  <div className="mb-3.5 grid grid-cols-2 gap-2.5">
                    <MiniStat label="Market cap" value={formatUsd(mcap)} />
                    <MiniStat label="Price" value={`${price.toFixed(6)} ◎`} />
                    <MiniStat
                      label="Treasury rev."
                      value={formatPriceSol(Number(treasury) / 1e9)}
                      color="#14f195"
                    />
                    <MiniStat
                      label="Sold"
                      value={`${
                        l.initialRealTokenReserves > 0n
                          ? (
                              Number(
                                ((l.initialRealTokenReserves - l.realTokenReserves) * 10_000n) /
                                  l.initialRealTokenReserves
                              ) / 100
                            ).toFixed(0)
                          : 0
                      }%`}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/token/${l.mint}`}
                      className="flex-1 cursor-pointer rounded-[10px] border border-input bg-white/[0.06] py-2.5 text-center text-[12.5px] font-semibold"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => handleShare(l.mint)}
                      className="flex-1 cursor-pointer rounded-[10px] border border-input bg-white/[0.06] py-2.5 text-[12.5px] font-semibold"
                    >
                      Share
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[10px] bg-white/[0.04] p-2.5">
      <div className="text-[10px] text-white/45">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-bold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
