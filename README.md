# Forge — On-Chain Token Launchpad on Solana

A fully on-chain token launchpad built with **Anchor** on Solana. Anyone can launch a fixed-supply
SPL token in one transaction and trade it instantly against a transparent, constant-product
bonding curve — all state lives in Program Derived Addresses (PDAs), with no backend, no
indexer, and no off-chain order book.

- **Live demo:** [https://forge-sol.vercel.app/](https://forge-sol.vercel.app/)
- This repository contains **both** the Anchor smart contract and the Next.js frontend.

## Motivation & Overview

Fair token launches need two things to be trustworthy: a price that's set by an open formula
instead of a team, and a market that can't be rug-pulled by withdrawing liquidity. Building
directly on Solana with Anchor gets both for free — every launch, buy, and sell is a signed
on-chain instruction against a PDA, readable and verifiable by anyone via `getProgramAccounts`,
with sub-cent fees and sub-second finality.

This repo demonstrates the full lifecycle of such a launch:

- Creating a token with a name, symbol, supply, starting price, and curve shape
- Buying and selling against the curve, priced entirely by on-chain reserves
- Splitting every trade's fee between the token's creator and the protocol, live
- Reconstructing price charts and trade history from transaction logs, with no indexer

## Key Concepts

### Bonding Curve (Constant-Product AMM)

Every token is backed by a `Curve` account holding virtual and real SOL/token reserves under the
same `x·y=k` invariant used by constant-product AMMs. Buying moves SOL into the curve and tokens
out to the buyer, shrinking the token side of the pool and pushing the price up along the curve;
selling reverses it. Nobody sets a price — it falls out of the reserves:

```
price = virtual_sol_reserves / virtual_token_reserves
```

The Linear vs. Exponential picker at creation only changes the starting virtual-reserve ratio
(flatter vs. steeper early price growth) — both use the exact same overflow-checked integer math,
so there's no separate, riskier formula hiding behind the choice.

### Program Derived Addresses (PDAs)

There is no database. Every piece of state is a PDA, deterministically derived and owned by the
program:

- **Curve** — mint, creator, name/symbol/description, curve reserves, total supply, sold/complete
  status, seeded by `["curve", mint]`
- **Treasury** — a single protocol-wide PDA that accrues the platform's half of every trading fee,
  seeded by `["treasury"]`

Anyone can reconstruct the entire token marketplace client-side by filtering the program's
accounts by discriminator — exactly how the frontend's Explore page works, with no indexer sitting
in between.

### Anchor Framework

**Anchor** is Solana's smart contract framework — Solana's equivalent of Foundry/Hardhat for EVM.
It handles account validation, serialization, PDA bump derivation, and IDL generation, so the
program logic in `lib.rs` stays focused on the actual business rules (curve math, fee splits,
slippage checks) instead of boilerplate.

## Architecture & Components

```
├── anchor/                                   # Anchor workspace
│   └── programs/launchpad/src/
│       ├── lib.rs                            # create_token, buy, sell
│       └── tests.rs                          # LiteSVM tests
├── app/                                       # Next.js frontend
│   ├── page.tsx                              # Explore (marketplace)
│   ├── create/page.tsx                       # Create a token
│   ├── token/[mint]/page.tsx                 # Token detail (chart / trade / trading panel)
│   ├── portfolio/page.tsx                    # Holdings, P&L, launched tokens
│   ├── components/
│   │   ├── token-card.tsx                    # Explore grid card
│   │   ├── price-chart.tsx                   # Real on-chain price + volume chart
│   │   ├── recent-trades.tsx                 # Decoded trade feed
│   │   ├── trading-panel.tsx                 # Buy/sell panel
│   │   └── wallet-modal.tsx                  # Wallet connect/disconnect
│   ├── generated/launchpad/                  # Codama-generated type-safe client
│   └── lib/
│       ├── bonding-curve.ts                  # TS mirror of the on-chain curve math
│       ├── trade-event.ts                    # Decodes TradeEvent from transaction logs
│       ├── portfolio-math.ts                 # Weighted-average-cost P&L accounting
│       ├── rpc-failover.ts                   # Multi-RPC-provider failover transport
│       ├── hooks/use-tokens.ts               # getProgramAccounts-based token discovery
│       ├── hooks/use-curve.ts                # Single Curve account fetch (SWR, live updates)
│       ├── hooks/use-trade-history.ts        # On-chain trade history decoding
│       └── wallet/                           # wallet-standard connection layer
└── codama.json                                # IDL → TypeScript client generation config
```

- **`lib.rs`** — the three instructions: `create_token`, `buy`, `sell`
- **`Curve`** — the account layout backing every token's bonding curve
- **`use-tokens.ts`** — discovers every launched token on-chain via a discriminator `memcmp`
  filter, no indexer required
- **`trading-panel.tsx`** — buy/sell UI driven entirely by `bonding-curve.ts`'s local quote math,
  so the "you receive" preview updates instantly without a round trip

## Libraries & Tooling

This project uses:

- **Anchor**

  > Solana's smart contract framework.

  Used for:

  - Writing and validating the program (`anchor build`)
  - Running tests (`anchor test`)
  - Deploying to devnet/mainnet (`anchor deploy`)
  - Generating the on-chain IDL that drives client codegen

- **Codama**

  > Generates a fully-typed TypeScript client from an Anchor IDL — Solana's equivalent of
  > typechain/wagmi's codegen.

  Used for:

  - Instruction builders (`getCreateTokenInstructionAsync`, `getBuyInstructionAsync`, etc.)
  - Account decoders (`decodeCurve`)
  - PDA derivation helpers (`findCurvePda`, `findTreasuryPda`, `findMetadataPda`)

- **`@solana/kit`**

  > Solana's modern JavaScript/TypeScript SDK (the successor to `@solana/web3.js`).

  Used for:

  - RPC calls, transaction building/signing, `getProgramAccounts` queries
  - A custom multi-provider failover transport (`rpc-failover.ts`) so devnet reads try dedicated
    RPC providers before falling back to the public endpoint
  - Wallet-standard integration for connecting any Solana wallet extension

- **Metaplex Token Metadata**

  > The on-chain standard wallets and explorers use to resolve a mint's name, symbol, and image.

  Used for:

  - Attaching a `CreateMetadataAccountV3` record to every minted token at launch, so it shows up
    correctly in Phantom and other wallets instead of as "Unknown Token"

- **LiteSVM**

  > A fast, lightweight, in-process Solana VM for testing — no local validator required.

  Used for:

  - Exercising the full create → buy → sell lifecycle in tests
  - Validating error conditions (slippage, sold-out reserves, oversized allocations) without
    touching a real cluster

- **Next.js + Tailwind CSS v4**. the frontend framework and styling for the marketplace, create,
  detail, and portfolio pages.

## How It Works (Token Flow)

1. **Create** — a wallet calls `create_token` with a name, symbol, supply, starting price, and
   curve shape; a fixed-supply mint is created, the creator's allocation is sent to their wallet,
   mint authority is revoked, Metaplex metadata is attached, and a `Curve` PDA is initialized,
   seeded by `[mint]`
2. **Buy** — any wallet calls `buy` with a SOL amount before slippage tolerance is exceeded; the
   constant-product formula computes tokens out, and a 1% fee splits 50/50 between the token's
   creator (paid directly to their wallet) and the protocol treasury
3. **Sell** — a token holder calls `sell` with a token amount; the same formula computes SOL out,
   with the same fee split, paid directly from the curve's own reserves

There's no resolution step — unlike a prediction market, a bonding curve is continuously priced,
so the frontend's token detail page just mirrors the curve's live reserves into a chart, a trade
feed decoded straight from transaction logs, and a buy/sell panel, all updating in real time as
the on-chain state changes.

## Author

**Jason Tong**
_Blockchain Developer | Smart Contract Engineer_

- **GitHub:** [JasonTongg](https://github.com/JasonTongg)
- **LinkedIn:** [Jason Tong](https://www.linkedin.com/in/jason-tong-42600319a/)
- **Focus:** Solana · Anchor · Rust · TypeScript · Next.js · Web3 · Foundry · Solidity · Hardhat
