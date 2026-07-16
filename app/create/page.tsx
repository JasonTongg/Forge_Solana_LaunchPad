"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateKeyPairSigner } from "@solana/kit";
import { useWallet } from "../lib/wallet/context";
import { useWalletModal } from "../lib/wallet/modal-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { parseLaunchpadError } from "../lib/launchpad-errors";
import { getCreateTokenInstructionAsync } from "../generated/launchpad";
import {
  DEFAULT_TOTAL_SUPPLY_WHOLE_TOKENS,
  MAX_CREATOR_ALLOC_BPS,
  TOKEN_SCALE,
  initialReserves,
  marketCapUsd,
  priceInSol,
  type CurveKind,
} from "../lib/bonding-curve";
import { formatUsd } from "../lib/format";
import { useCluster } from "../components/cluster-context";

export default function CreatePage() {
  const router = useRouter();
  const { wallet, signer, status } = useWallet();
  const { open: openWalletModal } = useWalletModal();
  const { send, isSending } = useSendTransaction();
  const { getExplorerUrl } = useCluster();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [supply, setSupply] = useState(DEFAULT_TOTAL_SUPPLY_WHOLE_TOKENS.toString());
  const [alloc, setAlloc] = useState("5");
  // A price this tiny relative to the default 1B supply keeps the starting market cap in the
  // low-thousands (pump.fun-style) so normal-sized trades produce visible price movement — a
  // price like 0.0001 against a billion-token supply implies a $14M starting mcap, which makes
  // the curve so deep that a typical buy/sell barely moves the price at all.
  const [price, setPrice] = useState("0.00000003");
  const [curveKind, setCurveKind] = useState<CurveKind>(1);

  const supplyNum = BigInt(Math.max(0, Math.round(Number(supply.replace(/,/g, "")) || 0)));
  const supplyBaseUnits = supplyNum * TOKEN_SCALE;
  const allocPct = Math.min(20, Math.max(0, Number(alloc) || 0));
  const allocBps = Math.round(allocPct * 100);
  const priceSol = Number(price) || 0;
  const priceLamports = BigInt(Math.max(1, Math.round(priceSol * 1_000_000_000)));

  const preview = useMemo(() => {
    if (supplyBaseUnits <= 0n) return null;
    const { virtualSolReserves, virtualTokenReserves, sellable } = initialReserves(
      curveKind,
      supplyBaseUnits,
      allocBps,
      priceLamports
    );
    const mcap = marketCapUsd(virtualSolReserves, virtualTokenReserves, supplyBaseUnits);
    const actualPrice = priceInSol(virtualSolReserves, virtualTokenReserves);
    const linear = curveKind === 0;
    const curvePoints = linear ? "6,94 294,10" : "6,94 90,88 150,74 195,54 235,30 294,8";
    const curveFill = linear
      ? "6,94 294,10 294,100 6,100"
      : "6,94 90,88 150,74 195,54 235,30 294,8 294,100 6,100";
    return { virtualSolReserves, virtualTokenReserves, sellable, mcap, actualPrice, curvePoints, curveFill };
  }, [curveKind, supplyBaseUnits, allocBps, priceLamports]);

  const canSubmit =
    name.trim().length > 0 &&
    name.length <= 32 &&
    symbol.trim().length > 0 &&
    symbol.length <= 10 &&
    supplyNum >= 1_000n &&
    priceSol > 0 &&
    !isSending;

  const handleLaunch = async () => {
    if (!wallet || !signer) {
      openWalletModal();
      return;
    }
    if (!canSubmit) return;

    try {
      const mint = await generateKeyPairSigner();
      const instruction = await getCreateTokenInstructionAsync({
        creator: signer,
        mint,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase().replace(/^\$/, ""),
        description: description.trim(),
        website: website.trim(),
        twitter: twitter.trim(),
        telegram: telegram.trim(),
        curveKind,
        creatorAllocBps: allocBps,
        initialPriceLamports: priceLamports,
        totalSupplyWholeTokens: supplyNum,
      });

      const signature = await send({ instructions: [instruction] });

      toast.success(`🚀 ${name || "Token"} launched on Solana!`, {
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
      router.push(`/token/${mint.address}`);
    } catch (err) {
      console.error("Create token failed:", err);
      toast.error(parseLaunchpadError(err));
    }
  };

  return (
    <div className="animate-fadeup mx-auto max-w-[1240px] px-8 pb-[70px] pt-10">
      <div className="mb-7">
        <h1 className="m-0 text-[34px] font-bold tracking-tight">Create a Token</h1>
        <p className="mt-2 text-[15px] text-white/50">
          Deploy an SPL token with a bonding curve in under a minute. No code required.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6.5 lg:grid-cols-[1fr_380px]">
        {/* FORM */}
        <div className="flex flex-col gap-5">
          <Card title="Basic Information">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label="Token name">
                <Input
                  value={name}
                  onChange={setName}
                  placeholder="e.g. Solar Doge"
                  maxLength={32}
                />
              </Field>
              <Field label="Symbol">
                <Input
                  value={symbol}
                  onChange={setSymbol}
                  placeholder="SOLDOGE"
                  maxLength={10}
                  mono
                />
              </Field>
            </div>
            <Field label="Description" className="mt-3.5">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is your token about?"
                rows={3}
                maxLength={200}
                className="w-full resize-y rounded-[11px] border border-input bg-white/[0.04] px-3.5 py-3 text-sm text-white"
              />
            </Field>
            <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <Field label="Website">
                <Input value={website} onChange={setWebsite} placeholder="forge.fun" maxLength={64} />
              </Field>
              <Field label="Twitter / X">
                <Input value={twitter} onChange={setTwitter} placeholder="@handle" maxLength={64} />
              </Field>
              <Field label="Telegram">
                <Input value={telegram} onChange={setTelegram} placeholder="t.me/…" maxLength={64} />
              </Field>
            </div>
          </Card>

          <Card title="Token Economics">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <Field label="Total supply">
                <Input value={supply} onChange={setSupply} mono />
              </Field>
              <Field label="Creator alloc % (max 20)">
                <Input value={alloc} onChange={setAlloc} mono />
              </Field>
              <Field label="Initial price (SOL)">
                <Input value={price} onChange={setPrice} mono />
              </Field>
            </div>
          </Card>

          <Card title="Bonding Curve">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CurveOption
                label="Linear"
                active={curveKind === 0}
                onClick={() => setCurveKind(0)}
                points="4,56 196,6"
                color="#9945ff"
                description="Price rises steadily with supply."
              />
              <CurveOption
                label="Exponential"
                active={curveKind === 1}
                onClick={() => setCurveKind(1)}
                points="4,56 70,52 110,42 140,30 165,16 196,4"
                color="#14f195"
                description="Cheap early, steep after demand."
              />
            </div>
          </Card>

          <Card title="Protocol Terms">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <ReadOnlyStat label="Trading fee" value="1.0% (fixed)" />
              <ReadOnlyStat label="Creator's share of fee" value="50%" />
              <ReadOnlyStat label={`Max creator alloc`} value={`${MAX_CREATOR_ALLOC_BPS / 100}%`} />
            </div>
          </Card>
        </div>

        {/* PREVIEW */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-[88px]">
          <div className="text-xs font-bold uppercase tracking-wide text-white/40">Live Preview</div>
          <div className="overflow-hidden rounded-2xl border border-input bg-[#0e0f16]">
            <div
              className="h-[66px]"
              style={{ background: "linear-gradient(120deg,#9945ff,#ff2d78 60%,#ff9500)" }}
            />
            <div className="relative px-4.5 pb-4.5">
              <div
                className="mb-3 -mt-7 h-14 w-14 rounded-2xl border-[3px] border-[#0e0f16]"
                style={{ background: "linear-gradient(135deg,#14f195,#00b4ff)" }}
              />
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{name || "Your Token"}</span>
                <span className="font-mono text-[13px] text-white/45">
                  ${symbol ? symbol.toUpperCase().replace(/^\$/, "") : "TICKER"}
                </span>
              </div>
              <div className="my-3.5 grid grid-cols-2 gap-2.5">
                <div className="rounded-[10px] bg-white/[0.04] p-2.5">
                  <div className="text-[10.5px] text-white/45">Init. price</div>
                  <div className="mt-0.5 font-mono text-sm font-bold">
                    {(preview?.actualPrice ?? priceSol).toFixed(9)} SOL
                  </div>
                </div>
                <div className="rounded-[10px] bg-white/[0.04] p-2.5">
                  <div className="text-[10.5px] text-white/45">Init. mcap</div>
                  <div className="mt-0.5 font-mono text-sm font-bold">
                    {formatUsd(preview?.mcap ?? 0)}
                  </div>
                </div>
              </div>
              <div className="mb-1.5 text-[11px] text-white/45">
                Estimated {curveKind === 0 ? "linear" : "exponential"} curve
              </div>
              {(preview?.mcap ?? 0) > 100_000 && (
                <div className="mb-1.5 rounded-[10px] bg-[rgba(255,149,0,.1)] p-2.5 text-[11px] text-[#ffb84d]">
                  A high starting market cap makes the curve deep — normal-sized trades will barely
                  move the price. Lower the initial price (relative to supply) for a more dynamic
                  curve.
                </div>
              )}
              <svg viewBox="0 0 300 100" className="h-20 w-full rounded-[10px] bg-white/[0.02]">
                <polyline
                  points={preview?.curveFill}
                  fill="rgba(20,241,149,.12)"
                  stroke="none"
                />
                <polyline
                  points={preview?.curvePoints}
                  fill="none"
                  stroke="#14f195"
                  strokeWidth={2.5}
                />
              </svg>
              <div className="mt-2.5 flex justify-between font-mono text-[11px] text-white/45">
                <span>Creator: {allocPct}%</span>
                <span>Supply: {supply || "0"}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleLaunch}
            disabled={!canSubmit && status === "connected"}
            className="w-full cursor-pointer rounded-[14px] border-0 py-4 text-[15px] font-bold text-white shadow-[0_10px_28px_rgba(153,69,255,.4)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#9945ff,#7d2dff)" }}
          >
            {isSending
              ? "Confirming…"
              : status !== "connected"
                ? "Connect wallet to launch"
                : "🚀 Launch Token"}
          </button>
          <div className="text-center text-[11.5px] text-white/40">
            Deploys on Solana · fixed supply, mint authority revoked
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-input bg-card p-5.5">
      <div className="mb-4 text-[13px] font-bold uppercase tracking-wide text-white/50">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[12.5px] text-white/60">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  maxLength,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`w-full rounded-[11px] border border-input bg-white/[0.04] px-3.5 py-3 text-sm text-white ${mono ? "font-mono" : ""}`}
    />
  );
}

function ReadOnlyStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] text-white/60">{label}</div>
      <div className="rounded-[11px] border border-input bg-white/[0.02] px-3.5 py-3 font-mono text-sm text-white/70">
        {value}
      </div>
    </div>
  );
}

function CurveOption({
  label,
  active,
  onClick,
  points,
  color,
  description,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  points: string;
  color: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-[13px] p-4 text-left transition"
      style={{
        border: `1.5px solid ${active ? color : "rgba(255,255,255,.1)"}`,
        background: active ? `${color}1a` : "transparent",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">{label}</span>
        <span
          className="h-4 w-4 rounded-full"
          style={{ border: `2px solid ${active ? color : "rgba(255,255,255,.25)"}` }}
        />
      </div>
      <svg viewBox="0 0 200 60" className="h-10 w-full">
        <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} />
      </svg>
      <div className="mt-1.5 text-[11.5px] text-white/45">{description}</div>
    </button>
  );
}
