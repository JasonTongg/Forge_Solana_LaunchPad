# Forge

A Solana token launchpad — create SPL tokens and trade them instantly against a transparent,
on-chain bonding curve. No backend, no indexer: everything the UI shows is read straight from the
chain (account state and program event logs).

```shell
npm install
npm run setup   # Builds the Anchor program and generates the TypeScript client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect a devnet wallet, and launch a token.

## What's Included

- **Explore** — a marketplace grid of every token launched through the program, with live price,
  market cap, holder count, and bonding-curve progress.
- **Create** — launch a fixed-supply SPL token with a configurable creator allocation, starting
  price, and Linear/Exponential bonding curve, with a live preview before you submit.
- **Trade** — a token detail page with a real price chart, recent trades, and a buy/sell panel,
  all derived from on-chain `TradeEvent`s decoded client-side.
- **Portfolio** — your holdings, average entry price and P&L, and the tokens you've launched
  (including trading fees earned as a creator).
- **Wallet connection** via wallet-standard with auto-discovery.
- **Cluster switching** — devnet, testnet, mainnet, and localnet from the header.
- **Codama-generated client** — type-safe program interactions using `@solana/kit`.

## Stack

| Layer          | Technology                       |
| -------------- | --------------------------------- |
| Frontend       | Next.js 16, React 19, TypeScript |
| Styling        | Tailwind CSS v4                  |
| Solana Client  | `@solana/kit`, wallet-standard   |
| Program Client | Codama-generated, `@solana/kit`  |
| Program        | Anchor (Rust)                    |

## Project Structure

```
├── app/
│   ├── components/
│   │   ├── nav.tsx               # Top nav: logo, page links, search, wallet
│   │   ├── wallet-modal.tsx      # Wallet connect/disconnect modal
│   │   ├── wallet-button.tsx     # Connect button / connected pill
│   │   ├── token-card.tsx        # Explore grid card
│   │   ├── price-chart.tsx       # Detail page price + volume chart
│   │   ├── recent-trades.tsx     # Detail page trade feed
│   │   ├── trading-panel.tsx     # Detail page buy/sell panel
│   │   ├── cluster-context.tsx   # Cluster state (React context + localStorage)
│   │   ├── cluster-select.tsx    # Cluster switcher dropdown
│   │   └── providers.tsx         # Wallet + cluster + wallet-modal providers
│   ├── generated/launchpad/      # Codama-generated program client
│   ├── lib/
│   │   ├── bonding-curve.ts      # TS mirror of the on-chain curve math (previews)
│   │   ├── trade-event.ts        # Decodes TradeEvent from transaction logs
│   │   ├── portfolio-math.ts     # Weighted-average-cost P&L accounting
│   │   ├── gradient-avatar.ts    # Deterministic token logo/banner gradients
│   │   ├── launchpad-errors.ts   # Program error -> human-readable message
│   │   ├── wallet/               # Wallet-standard connection layer + modal state
│   │   ├── hooks/
│   │   │   ├── use-tokens.ts               # All launched tokens (getProgramAccounts)
│   │   │   ├── use-curve.ts                # One token's live curve state
│   │   │   ├── use-token-balance.ts        # Wallet SPL balances
│   │   │   ├── use-trade-history.ts        # Decoded on-chain trade history
│   │   │   ├── use-portfolio-positions.ts  # Cross-mint P&L for Portfolio
│   │   │   ├── use-holder-count.ts         # Per-token holder count
│   │   │   └── use-send-transaction.ts     # Transaction send with loading state
│   │   ├── cluster.ts / solana-client.ts   # Cluster endpoints + RPC client factory
│   │   └── lamports.ts / explorer.ts       # Formatting helpers
│   ├── page.tsx                  # Explore (marketplace)
│   ├── create/page.tsx           # Create a token
│   ├── token/[mint]/page.tsx     # Token detail + trading
│   └── portfolio/page.tsx        # Portfolio
├── anchor/                       # Anchor workspace
│   └── programs/launchpad/       # Bonding-curve launchpad program (Rust)
└── codama.json                   # Codama client generation config
```

## Local Development

To test against a local validator instead of devnet:

1. **Start a local validator**

   ```bash
   solana-test-validator
   ```

2. **Deploy the program locally**

   ```bash
   solana config set --url localhost
   cd anchor
   anchor build
   anchor deploy
   cd ..
   npm run codama:js   # Regenerate client with local program ID
   ```

3. **Switch to localnet** in the app using the cluster selector in the header.

## Deploy Your Own Program

The included launchpad program is already deployed to devnet. See
[`anchor/README.md`](anchor/README.md) for the steps to deploy your own.

## Testing

Program tests use [LiteSVM](https://github.com/LiteSVM/litesvm), a fast lightweight Solana VM.

```bash
npm run anchor-build   # Build the program first
npm run anchor-test    # Run tests
```

Tests are in `anchor/programs/launchpad/src/tests.rs` and cover token creation, buy/sell math and
fee splits, slippage rejection, and sold-out rejection.

## Regenerating the Client

If you modify the program, regenerate the TypeScript client:

```bash
npm run setup   # Or: npm run anchor-build && npm run codama:js
```

This uses [Codama](https://github.com/codama-idl/codama) to generate a type-safe client from the
Anchor IDL.

## Learn More

- [Solana Docs](https://solana.com/docs) — core concepts and guides
- [Anchor Docs](https://www.anchor-lang.com/docs/introduction) — program development framework
- [Deploying Programs](https://solana.com/docs/programs/deploying) — deployment guide
- [@solana/kit](https://github.com/anza-xyz/kit) — Solana JavaScript SDK
- [Codama](https://github.com/codama-idl/codama) — client generation from IDL
