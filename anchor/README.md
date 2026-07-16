# Forge Launchpad Program

This is the on-chain program behind Forge — a bonding-curve token launchpad built with [Anchor](https://www.anchor-lang.com/).

## Pre-deployed Program

The launchpad program is deployed on **devnet** at:

```
JDM6td9j7ngctTN7UsfruprV8dGoqn8DCcbigmcny8w7
```

You can interact with it immediately by connecting your wallet to devnet.

## Program Overview

- **`create_token`** — mints a fixed-supply SPL token, sends the creator's allocation to their
  wallet, revokes mint authority, and initializes a `Curve` account that backs the token with a
  constant-product (x·y=k) bonding curve. The Linear/Exponential picker only changes the starting
  virtual-reserve ratio (flatter vs. steeper early price growth) — both use the same proven,
  overflow-checked integer math.
- **`buy`** / **`sell`** — trade SOL for tokens (or back) against the curve, with slippage
  protection (`min_token_out` / `min_sol_out`). A 1% trading fee is split 50/50 between the token's
  creator (paid directly to their wallet on every trade) and a protocol treasury PDA.
- Every trade emits a `TradeEvent` (post-trade reserves included) that the frontend decodes
  straight from transaction logs to build price charts and trade history — no indexer needed.

## Deploying Your Own Program

To deploy your own version of the program:

### 1. Generate a new program keypair

```bash
cd anchor
solana-keygen new -o target/deploy/launchpad-keypair.json
```

### 2. Get the new program ID

```bash
solana address -k target/deploy/launchpad-keypair.json
```

### 3. Update the program ID

Update the program ID in these files:

- `anchor/Anchor.toml` — update `launchpad = "..."` under `[programs.devnet]`
- `anchor/programs/launchpad/src/lib.rs` — update `declare_id!("...")`

### 4. Build and deploy

```bash
# Build the program
anchor build

# Get devnet SOL for deployment (~2-3 SOL needed)
solana airdrop 2 --url devnet

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### 5. Fund the treasury PDA (required, one-time)

The protocol treasury is a bare PDA (`seeds = ["treasury"]`) that starts at 0 lamports. Solana's
runtime rejects any transaction that leaves an account with a nonzero balance below the
rent-exempt minimum, so the very first `buy`/`sell` fee credited to an empty treasury can fail if
that fee happens to be smaller than ~0.00089 SOL. Fund it once, from any wallet, before the first
trade:

```bash
solana address -k target/deploy/launchpad-keypair.json  # note the program ID
# Derive the treasury PDA (seeds = ["treasury"]) for that program ID, e.g. via a short
# @solana/kit script calling `getProgramDerivedAddress`, then:
solana transfer <treasury-pda-address> 0.01 --allow-unfunded-recipient --url devnet
```

It only ever gains lamports from trading fees afterward, so this is a one-time step.

### 6. Regenerate the TypeScript client

```bash
cd ..
npm run codama:js
```

This updates the generated client code in `app/generated/launchpad/` with your new program ID.

## Testing

Tests use [LiteSVM](https://github.com/LiteSVM/litesvm) and cover token creation (fixed supply,
creator allocation, mint authority revocation), buy/sell reserve and fee-split math, slippage
rejection, and sold-out rejection.

```bash
anchor build
anchor test --skip-deploy
```
