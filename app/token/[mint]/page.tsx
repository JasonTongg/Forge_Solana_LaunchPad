"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { address } from "@solana/kit";
import { useCurve } from "../../lib/hooks/use-curve";
import { useTradeHistory } from "../../lib/hooks/use-trade-history";
import { useHolderCount } from "../../lib/hooks/use-holder-count";
import { useNowSeconds } from "../../lib/hooks/use-now-seconds";
import { priceInSol, marketCapUsd, toWholeTokens } from "../../lib/bonding-curve";
import { formatUsd, formatPriceSol, formatTokenAmount, formatAge, formatImpactPct } from "../../lib/format";
import { ellipsify } from "../../lib/explorer";
import { gradientForAddress } from "../../lib/gradient-avatar";
import { PriceChart } from "../../components/price-chart";
import { RecentTrades } from "../../components/recent-trades";
import { TradingPanel } from "../../components/trading-panel";

export default function TokenDetailPage() {
  const router = useRouter();
  const params = useParams<{ mint: string }>();
  const mint = address(params.mint);

  const { curve, isLoading, mutate: mutateCurve } = useCurve(mint);
  const { trades, mutate: mutateTrades } = useTradeHistory(mint);
  const { holders } = useHolderCount(mint);
  const nowSec = useNowSeconds();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1240px] px-8 py-16">
        <div className="animate-shimmer h-[300px] rounded-2xl border border-white/[0.06]" />
      </div>
    );
  }

  if (!curve) {
    return (
      <div className="mx-auto max-w-[1240px] px-8 py-24 text-center">
        <p className="text-lg text-white/60">Token not found.</p>
        <button onClick={() => router.push("/")} className="mt-4 text-[#b98cff] underline">
          Back to Explore
        </button>
      </div>
    );
  }

  const price = priceInSol(curve.virtualSolReserves, curve.virtualTokenReserves);
  const mcap = marketCapUsd(curve.virtualSolReserves, curve.virtualTokenReserves, curve.tokenTotalSupply);
  const initialPrice = priceInSol(curve.initialVirtualSolReserves, curve.initialVirtualTokenReserves);
  const changeSinceLaunch = initialPrice > 0 ? ((price - initialPrice) / initialPrice) * 100 : 0;
  const changeColor = changeSinceLaunch >= 0 ? "#14f195" : "#ff4d6d";

  const circulating = curve.tokenTotalSupply - curve.realTokenReserves;

  const volume24h = trades
    .filter((t) => nowSec - (t.blockTime ?? 0) <= 86_400)
    .reduce((sum, t) => sum + Number(t.solAmount) / 1e9, 0);

  const detailStats = [
    { label: "Current price", value: `${price.toFixed(6)} ◎` },
    { label: "Market cap", value: formatUsd(mcap) },
    { label: "Total supply", value: formatTokenAmount(toWholeTokens(curve.tokenTotalSupply)) },
    { label: "Circulating", value: formatTokenAmount(toWholeTokens(circulating)) },
    { label: "Holders", value: holders != null ? formatTokenAmount(holders) : "…" },
    { label: "24h volume", value: formatPriceSol(volume24h) },
  ];

  const handleTraded = () => {
    void mutateCurve();
    void mutateTrades();
  };

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="animate-fadeup mx-auto max-w-[1240px] px-8 pb-[70px] pt-6">
      <button
        onClick={() => router.push("/")}
        className="mb-5 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-white/50"
      >
        ← Back to Explore
      </button>

      {/* HEADER */}
      <div className="mb-5.5 flex flex-wrap items-start gap-4.5">
        <div
          className="h-[76px] w-[76px] shrink-0 rounded-[20px] shadow-[0_8px_24px_rgba(0,0,0,.4)]"
          style={{ background: gradientForAddress(curve.mint) }}
        />
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[26px] font-bold tracking-tight sm:text-[28px]">{curve.name}</h1>
            <span className="font-mono text-[15px] text-white/45">${curve.symbol}</span>
            <span
              className="rounded-full bg-[rgba(20,241,149,.12)] px-2.5 py-1 font-mono text-xs font-semibold"
              style={{ color: changeColor }}
            >
              {formatImpactPct(changeSinceLaunch)}
            </span>
          </div>
          <p className="my-2 max-w-[560px] text-sm text-white/55">
            {curve.description || "No description provided."}
          </p>
          <div className="flex flex-wrap gap-4 font-mono text-xs text-white/45">
            {curve.website && (
              <a href={curve.website} target="_blank" rel="noopener noreferrer">
                🌐 website
              </a>
            )}
            {curve.twitter && (
              <a href={curve.twitter} target="_blank" rel="noopener noreferrer">
                𝕏 twitter
              </a>
            )}
            {curve.telegram && (
              <a href={curve.telegram} target="_blank" rel="noopener noreferrer">
                ✈ telegram
              </a>
            )}
            <span>by {ellipsify(curve.creator, 4)}</span>
            <span>launched {formatAge(Number(curve.createdAt))} ago</span>
            <button onClick={handleShare} className="cursor-pointer underline">
              Share
            </button>
          </div>
        </div>
        <div className="text-right">
          <div className="mb-0.5 text-[11px] text-white/45">Current price</div>
          <div className="font-mono text-[30px] font-bold">{price.toFixed(6)} ◎</div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {detailStats.map((d) => (
          <div key={d.label} className="rounded-[13px] border border-border-low bg-white/[0.03] p-3.5">
            <div className="mb-1.5 text-[10.5px] text-white/45">{d.label}</div>
            <div className="font-mono text-[15px] font-bold">{d.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5.5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <PriceChart trades={trades} currentPriceSol={price} />
          <RecentTrades trades={trades} symbol={curve.symbol} />
        </div>
        <div className="lg:sticky lg:top-[88px]">
          <TradingPanel curve={curve} onTraded={handleTraded} />
        </div>
      </div>
    </div>
  );
}
