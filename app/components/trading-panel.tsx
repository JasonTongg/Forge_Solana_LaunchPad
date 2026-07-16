"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { useWallet } from "../lib/wallet/context";
import { useWalletModal } from "../lib/wallet/modal-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useTokenBalance } from "../lib/hooks/use-token-balance";
import { useBalance } from "../lib/hooks/use-balance";
import { parseLaunchpadError } from "../lib/launchpad-errors";
import { getBuyInstructionAsync, getSellInstructionAsync } from "../generated/launchpad";
import { quoteBuy, quoteSell, withSlippage, toWholeTokens, toBaseUnits } from "../lib/bonding-curve";
import { formatTokenAmount, formatPriceSol, formatImpactPct, formatPct } from "../lib/format";
import type { CurveWithAddress } from "../lib/hooks/use-curve";
import { useCluster } from "../components/cluster-context";

const SLIPPAGE_BPS = 100; // 1%

export function TradingPanel({
  curve,
  onTraded,
}: {
  curve: CurveWithAddress;
  onTraded: () => void;
}) {
  const { wallet, signer } = useWallet();
  const { open: openWalletModal } = useWalletModal();
  const { send, isSending } = useSendTransaction();
  const { getExplorerUrl } = useCluster();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [buyAmount, setBuyAmount] = useState("1.0");
  const [sellAmount, setSellAmount] = useState("0");

  const walletAddress = wallet?.account.address;
  const { lamports: solLamports } = useBalance(walletAddress);
  const { balance: tokenBalance } = useTokenBalance(walletAddress, curve.mint as Address);

  const buySolIn = BigInt(Math.max(0, Math.round((Number(buyAmount) || 0) * 1e9)));
  const buyQuote = useMemo(
    () => quoteBuy(curve.virtualSolReserves, curve.virtualTokenReserves, buySolIn),
    [curve.virtualSolReserves, curve.virtualTokenReserves, buySolIn]
  );

  const sellTokenIn = toBaseUnits(Number(sellAmount) || 0);
  const sellQuote = useMemo(
    () => quoteSell(curve.virtualSolReserves, curve.virtualTokenReserves, sellTokenIn),
    [curve.virtualSolReserves, curve.virtualTokenReserves, sellTokenIn]
  );
  // Tokens from the creator allocation were never bought, so they aren't backed by
  // real SOL in the curve — selling them (or any amount beyond what's been bought
  // and not yet sold back) would ask the curve for more SOL than it actually holds.
  const exceedsLiquidity = sellTokenIn > 0n && sellQuote.solOutGross > curve.realSolReserves;

  const priceNow =
    curve.virtualTokenReserves > 0n
      ? Number(curve.virtualSolReserves) / 1e9 / (Number(curve.virtualTokenReserves) / 1e6)
      : 0;
  const newPriceAfterBuy =
    buyQuote.newVirtualTokenReserves > 0n
      ? Number(buyQuote.newVirtualSolReserves) / 1e9 / (Number(buyQuote.newVirtualTokenReserves) / 1e6)
      : priceNow;
  const buyImpactPct = priceNow > 0 ? ((newPriceAfterBuy - priceNow) / priceNow) * 100 : 0;

  const newPriceAfterSell =
    sellQuote.newVirtualTokenReserves > 0n
      ? Number(sellQuote.newVirtualSolReserves) / 1e9 / (Number(sellQuote.newVirtualTokenReserves) / 1e6)
      : priceNow;
  const sellImpactPct = priceNow > 0 ? ((newPriceAfterSell - priceNow) / priceNow) * 100 : 0;

  const requireWallet = (fn: () => void) => () => {
    if (!wallet || !signer) {
      openWalletModal();
      return;
    }
    fn();
  };

  const handleBuy = async () => {
    if (!signer || buySolIn <= 0n) return;
    try {
      const minTokenOut = withSlippage(buyQuote.tokensOut, SLIPPAGE_BPS);
      const instruction = await getBuyInstructionAsync({
        buyer: signer,
        mint: curve.mint as Address,
        creator: curve.creator as Address,
        solIn: buySolIn,
        minTokenOut,
      });
      const signature = await send({ instructions: [instruction] });
      toast.success(`Bought ${curve.symbol}`, {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      onTraded();
    } catch (err) {
      console.error("Buy failed:", err);
      toast.error(parseLaunchpadError(err));
    }
  };

  const handleSell = async () => {
    if (!signer || sellTokenIn <= 0n) return;
    try {
      const minSolOut = withSlippage(sellQuote.solOutNet, SLIPPAGE_BPS);
      const instruction = await getSellInstructionAsync({
        seller: signer,
        mint: curve.mint as Address,
        creator: curve.creator as Address,
        tokenIn: sellTokenIn,
        minSolOut,
      });
      const signature = await send({ instructions: [instruction] });
      toast.success(`Sold ${curve.symbol}`, {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      onTraded();
    } catch (err) {
      console.error("Sell failed:", err);
      toast.error(parseLaunchpadError(err));
    }
  };

  const pctSold =
    curve.initialRealTokenReserves > 0n
      ? Number(
          ((curve.initialRealTokenReserves - curve.realTokenReserves) * 10_000n) /
            curve.initialRealTokenReserves
        ) / 100
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-input bg-card p-4.5">
        <div className="mb-4 flex gap-1.5 rounded-xl bg-white/[0.04] p-1.5">
          <button
            onClick={() => setTab("buy")}
            className="flex-1 cursor-pointer rounded-lg py-2.5 text-sm font-bold"
            style={{
              background: tab === "buy" ? "#14f195" : "transparent",
              color: tab === "buy" ? "#08090d" : "rgba(255,255,255,.55)",
            }}
          >
            Buy
          </button>
          <button
            onClick={() => setTab("sell")}
            className="flex-1 cursor-pointer rounded-lg py-2.5 text-sm font-bold"
            style={{
              background: tab === "sell" ? "#ff4d6d" : "transparent",
              color: tab === "sell" ? "#fff" : "rgba(255,255,255,.55)",
            }}
          >
            Sell
          </button>
        </div>

        {tab === "buy" ? (
          <>
            <label className="mb-1.5 block text-xs text-white/55">You pay (SOL)</label>
            <div className="relative mb-3">
              <input
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                className="w-full rounded-xl border border-input bg-white/[0.04] px-3.5 py-3.5 pr-14 font-mono text-lg font-bold text-white"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-white/50">
                SOL
              </span>
            </div>
            <div className="mb-3.5 flex gap-1.5">
              {["0.5", "1", "5"].map((v) => (
                <button
                  key={v}
                  onClick={() => setBuyAmount(v)}
                  className="flex-1 cursor-pointer rounded-lg border border-input bg-white/[0.03] py-1.5 font-mono text-xs text-white/70"
                >
                  {v} ◎
                </button>
              ))}
              <button
                onClick={() =>
                  setBuyAmount(
                    solLamports != null
                      ? (Number(solLamports) / 1e9).toFixed(3)
                      : "0"
                  )
                }
                className="flex-1 cursor-pointer rounded-lg border border-input bg-white/[0.03] py-1.5 font-mono text-xs text-white/70"
              >
                Max
              </button>
            </div>
            <div className="mb-3.5 flex flex-col gap-2 rounded-xl bg-white/[0.03] p-3.5">
              <Row label="You receive" value={`${formatTokenAmount(toWholeTokens(buyQuote.tokensOut))} ${curve.symbol}`} />
              <Row label="Price" value={formatPriceSol(priceNow)} />
              <Row label="Price impact" value={formatImpactPct(buyImpactPct)} valueColor="#14f195" />
            </div>
            <button
              onClick={requireWallet(handleBuy)}
              disabled={isSending || buySolIn <= 0n}
              className="w-full cursor-pointer rounded-[13px] border-0 py-4 text-[15px] font-bold text-[#08090d] shadow-[0_8px_22px_rgba(20,241,149,.3)] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#14f195,#0bbf76)" }}
            >
              {isSending ? "Confirming…" : !wallet ? "Connect wallet to buy" : `Buy ${curve.symbol}`}
            </button>
          </>
        ) : (
          <>
            <label className="mb-1.5 block text-xs text-white/55">You sell ({curve.symbol})</label>
            <div className="relative mb-3.5">
              <input
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                className="w-full rounded-xl border border-input bg-white/[0.04] px-3.5 py-3.5 pr-16 font-mono text-lg font-bold text-white"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-white/50">
                {curve.symbol}
              </span>
            </div>
            <div className="mb-3.5 flex gap-1.5">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setSellAmount(toWholeTokens((tokenBalance * BigInt(pct)) / 100n).toFixed(6))}
                  className="flex-1 cursor-pointer rounded-lg border border-input bg-white/[0.03] py-1.5 font-mono text-xs text-white/70"
                >
                  {pct === 100 ? "Max" : `${pct}%`}
                </button>
              ))}
            </div>
            <div className="mb-3.5 flex flex-col gap-2 rounded-xl bg-white/[0.03] p-3.5">
              <Row label="You receive" value={`${(Number(sellQuote.solOutNet) / 1e9).toFixed(6)} SOL`} />
              <Row label="Price impact" value={formatImpactPct(sellImpactPct)} valueColor="#ff4d6d" />
            </div>
            {exceedsLiquidity && (
              <p className="mb-3.5 rounded-xl border border-[rgba(255,77,109,.3)] bg-[rgba(255,77,109,.08)] p-3 text-[12.5px] text-[#ff9eb0]">
                Not enough SOL in this curve to cover that sale yet. If you received these tokens
                as the creator&apos;s allocation, they aren&apos;t backed by real reserves until
                someone buys them — try a smaller amount.
              </p>
            )}
            <button
              onClick={requireWallet(handleSell)}
              disabled={isSending || sellTokenIn <= 0n || sellTokenIn > tokenBalance || exceedsLiquidity}
              className="w-full cursor-pointer rounded-[13px] border-0 py-4 text-[15px] font-bold text-white shadow-[0_8px_22px_rgba(255,77,109,.3)] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#ff4d6d,#d62f4f)" }}
            >
              {isSending
                ? "Confirming…"
                : !wallet
                  ? "Connect wallet to sell"
                  : exceedsLiquidity
                    ? "Not enough liquidity"
                    : `Sell ${curve.symbol}`}
            </button>
          </>
        )}

        <div className="my-4 h-px bg-white/[0.07]" />
        <div className="mb-1.5 flex justify-between">
          <span className="text-[13px] text-white/50">Launch progress</span>
          <span className="font-mono text-[13px] font-bold">{formatPct(pctSold)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, Math.max(0, pctSold))}%`,
              background: "linear-gradient(90deg,#9945ff,#14f195)",
            }}
          />
        </div>
      </div>

      {wallet && (
        <div className="rounded-2xl border border-input bg-card p-4.5">
          <div className="mb-3.5 text-sm font-bold">Your Position</div>
          <div className="flex flex-col gap-2.5">
            <Row label="Balance" value={`${formatTokenAmount(toWholeTokens(tokenBalance))} ${curve.symbol}`} bold />
            <Row label="Value" value={`${(toWholeTokens(tokenBalance) * priceNow).toFixed(4)} ◎`} bold />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-white/50">{label}</span>
      <span
        className={`font-mono ${bold ? "font-semibold" : ""}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
