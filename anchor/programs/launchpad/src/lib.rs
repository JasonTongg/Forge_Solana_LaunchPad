use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{
    mint_to, set_authority, transfer_checked, Mint, MintTo, SetAuthority, Token, TokenAccount,
    TransferChecked,
};
use mpl_token_metadata::instructions::CreateMetadataAccountV3CpiBuilder;
use mpl_token_metadata::types::DataV2;

#[cfg(test)]
mod tests;

declare_id!("ANaWxoKwFSv5MfMQuxpxheqpVuL84ixG5d8eVUyVjU5N");

pub const TOKEN_DECIMALS: u8 = 6;
/// 10 ** TOKEN_DECIMALS.
pub const TOKEN_SCALE: u64 = 1_000_000;
pub const MIN_TOTAL_SUPPLY_WHOLE_TOKENS: u64 = 1_000;
pub const MAX_TOTAL_SUPPLY_WHOLE_TOKENS: u64 = 100_000_000_000;
/// Total trading fee, in basis points (100 = 1%).
pub const PLATFORM_FEE_BPS: u64 = 100;
/// Share of the trading fee routed to the token's creator, in basis points of the fee itself.
pub const CREATOR_FEE_SHARE_BPS: u64 = 5_000;
/// Creator allocation cannot exceed this share of total supply, in basis points.
pub const MAX_CREATOR_ALLOC_BPS: u64 = 2_000;
pub const BPS_DENOMINATOR: u64 = 10_000;

pub const CURVE_SEED: &[u8] = b"curve";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const METADATA_SEED: &[u8] = b"metadata";

#[program]
pub mod launchpad {
    use super::*;

    pub fn create_token(
        ctx: Context<CreateToken>,
        name: String,
        symbol: String,
        description: String,
        website: String,
        twitter: String,
        telegram: String,
        curve_kind: u8,
        creator_alloc_bps: u16,
        initial_price_lamports: u64,
        total_supply_whole_tokens: u64,
    ) -> Result<()> {
        require!(name.len() <= 32, LaunchpadError::NameTooLong);
        require!(!name.is_empty(), LaunchpadError::NameTooLong);
        require!(symbol.len() <= 10, LaunchpadError::SymbolTooLong);
        require!(!symbol.is_empty(), LaunchpadError::SymbolTooLong);
        require!(
            description.len() <= 200,
            LaunchpadError::DescriptionTooLong
        );
        require!(
            website.len() <= 64 && twitter.len() <= 64 && telegram.len() <= 64,
            LaunchpadError::LinkTooLong
        );
        require!(curve_kind == 0 || curve_kind == 1, LaunchpadError::InvalidCurveKind);
        require!(
            (creator_alloc_bps as u64) <= MAX_CREATOR_ALLOC_BPS,
            LaunchpadError::AllocationTooHigh
        );
        require!(initial_price_lamports > 0, LaunchpadError::InvalidPrice);
        require!(
            total_supply_whole_tokens >= MIN_TOTAL_SUPPLY_WHOLE_TOKENS
                && total_supply_whole_tokens <= MAX_TOTAL_SUPPLY_WHOLE_TOKENS,
            LaunchpadError::InvalidSupply
        );

        let total_supply = total_supply_whole_tokens
            .checked_mul(TOKEN_SCALE)
            .ok_or(LaunchpadError::MathOverflow)?;

        let creator_alloc_amount = u64::try_from(
            (total_supply as u128)
                .checked_mul(creator_alloc_bps as u128)
                .ok_or(LaunchpadError::MathOverflow)?
                .checked_div(BPS_DENOMINATOR as u128)
                .ok_or(LaunchpadError::MathOverflow)?,
        )
        .map_err(|_| LaunchpadError::MathOverflow)?;

        let sellable = total_supply
            .checked_sub(creator_alloc_amount)
            .ok_or(LaunchpadError::MathOverflow)?;

        // Exponential gets a small virtual cushion (steep, "cheap early, steep after demand");
        // Linear gets a large cushion (flatter, "price rises steadily"). Same constant-product
        // math either way — only the starting reserve ratio differs.
        let (cushion_num, cushion_den): (u128, u128) = if curve_kind == 1 {
            (27, 20)
        } else {
            (3, 1)
        };
        let virtual_token_reserves = u64::try_from(
            (sellable as u128)
                .checked_mul(cushion_num)
                .ok_or(LaunchpadError::MathOverflow)?
                .checked_div(cushion_den)
                .ok_or(LaunchpadError::MathOverflow)?,
        )
        .map_err(|_| LaunchpadError::MathOverflow)?;

        let virtual_sol_reserves = u64::try_from(
            (initial_price_lamports as u128)
                .checked_mul(virtual_token_reserves as u128)
                .ok_or(LaunchpadError::MathOverflow)?
                .checked_div(TOKEN_SCALE as u128)
                .ok_or(LaunchpadError::MathOverflow)?,
        )
        .map_err(|_| LaunchpadError::MathOverflow)?;
        require!(virtual_sol_reserves > 0, LaunchpadError::InvalidPrice);

        let now = Clock::get()?.unix_timestamp;

        ctx.accounts.curve.set_inner(Curve {
            mint: ctx.accounts.mint.key(),
            creator: ctx.accounts.creator.key(),
            name,
            symbol,
            description,
            website,
            twitter,
            telegram,
            curve_kind,
            initial_virtual_sol_reserves: virtual_sol_reserves,
            initial_virtual_token_reserves: virtual_token_reserves,
            virtual_sol_reserves,
            virtual_token_reserves,
            real_sol_reserves: 0,
            real_token_reserves: sellable,
            initial_real_token_reserves: sellable,
            token_total_supply: total_supply,
            created_at: now,
            complete: sellable == 0,
            bump: ctx.bumps.curve,
        });

        let mint_key = ctx.accounts.mint.key();
        let bump = ctx.accounts.curve.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[CURVE_SEED, mint_key.as_ref(), &[bump]]];

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.curve.to_account_info(),
                },
                signer_seeds,
            ),
            total_supply,
        )?;

        if creator_alloc_amount > 0 {
            transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.curve_token_vault.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.creator_token_account.to_account_info(),
                        authority: ctx.accounts.curve.to_account_info(),
                    },
                    signer_seeds,
                ),
                creator_alloc_amount,
                TOKEN_DECIMALS,
            )?;
        }

        // Attach on-chain name/symbol so wallets and explorers don't show "Unknown Token".
        // No off-chain JSON host in this app, so uri is left blank — wallets will show the name
        // and symbol but no custom image.
        CreateMetadataAccountV3CpiBuilder::new(&ctx.accounts.token_metadata_program.to_account_info())
            .metadata(&ctx.accounts.metadata.to_account_info())
            .mint(&ctx.accounts.mint.to_account_info())
            .mint_authority(&ctx.accounts.curve.to_account_info())
            .payer(&ctx.accounts.creator.to_account_info())
            .update_authority(&ctx.accounts.curve.to_account_info(), true)
            .system_program(&ctx.accounts.system_program.to_account_info())
            .data(DataV2 {
                name: ctx.accounts.curve.name.clone(),
                symbol: ctx.accounts.curve.symbol.clone(),
                uri: String::new(),
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            })
            .is_mutable(false)
            .invoke_signed(signer_seeds)?;

        set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.curve.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds,
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        emit!(CreateEvent {
            mint: mint_key,
            creator: ctx.accounts.creator.key(),
            curve_kind,
            timestamp: now,
        });

        Ok(())
    }

    pub fn buy(ctx: Context<Buy>, sol_in: u64, min_token_out: u64) -> Result<()> {
        require!(sol_in > 0, LaunchpadError::InvalidAmount);
        require!(!ctx.accounts.curve.complete, LaunchpadError::SoldOut);

        let curve = &ctx.accounts.curve;
        let fee_total = fee_amount(sol_in)?;
        let creator_fee = creator_share(fee_total)?;
        let protocol_fee = fee_total
            .checked_sub(creator_fee)
            .ok_or(LaunchpadError::MathOverflow)?;
        let net_sol_in = sol_in
            .checked_sub(fee_total)
            .ok_or(LaunchpadError::MathOverflow)?;

        let k = (curve.virtual_sol_reserves as u128)
            .checked_mul(curve.virtual_token_reserves as u128)
            .ok_or(LaunchpadError::MathOverflow)?;
        let new_virtual_sol = curve
            .virtual_sol_reserves
            .checked_add(net_sol_in)
            .ok_or(LaunchpadError::MathOverflow)?;
        let new_virtual_token = u64::try_from(
            k.checked_div(new_virtual_sol as u128)
                .ok_or(LaunchpadError::MathOverflow)?,
        )
        .map_err(|_| LaunchpadError::MathOverflow)?;
        let tokens_out = curve
            .virtual_token_reserves
            .checked_sub(new_virtual_token)
            .ok_or(LaunchpadError::MathOverflow)?;

        require!(tokens_out > 0, LaunchpadError::InvalidAmount);
        require!(tokens_out >= min_token_out, LaunchpadError::SlippageExceeded);
        require!(
            tokens_out <= curve.real_token_reserves,
            LaunchpadError::SoldOut
        );

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.curve.to_account_info(),
                },
            ),
            net_sol_in,
        )?;
        if protocol_fee > 0 {
            transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                protocol_fee,
            )?;
        }
        if creator_fee > 0 {
            transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer.to_account_info(),
                        to: ctx.accounts.creator.to_account_info(),
                    },
                ),
                creator_fee,
            )?;
        }

        let mint_key = ctx.accounts.mint.key();
        let bump = ctx.accounts.curve.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[CURVE_SEED, mint_key.as_ref(), &[bump]]];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.curve_token_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.curve.to_account_info(),
                },
                signer_seeds,
            ),
            tokens_out,
            TOKEN_DECIMALS,
        )?;

        let curve = &mut ctx.accounts.curve;
        curve.virtual_sol_reserves = new_virtual_sol;
        curve.virtual_token_reserves = new_virtual_token;
        curve.real_sol_reserves = curve
            .real_sol_reserves
            .checked_add(net_sol_in)
            .ok_or(LaunchpadError::MathOverflow)?;
        curve.real_token_reserves = curve
            .real_token_reserves
            .checked_sub(tokens_out)
            .ok_or(LaunchpadError::MathOverflow)?;
        curve.complete = curve.real_token_reserves == 0;

        emit!(TradeEvent {
            mint: mint_key,
            trader: ctx.accounts.buyer.key(),
            is_buy: true,
            sol_amount: sol_in,
            token_amount: tokens_out,
            creator_fee,
            protocol_fee,
            virtual_sol_reserves: curve.virtual_sol_reserves,
            virtual_token_reserves: curve.virtual_token_reserves,
            real_sol_reserves: curve.real_sol_reserves,
            real_token_reserves: curve.real_token_reserves,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn sell(ctx: Context<Sell>, token_in: u64, min_sol_out: u64) -> Result<()> {
        require!(token_in > 0, LaunchpadError::InvalidAmount);

        let curve = &ctx.accounts.curve;
        let k = (curve.virtual_sol_reserves as u128)
            .checked_mul(curve.virtual_token_reserves as u128)
            .ok_or(LaunchpadError::MathOverflow)?;
        let new_virtual_token = curve
            .virtual_token_reserves
            .checked_add(token_in)
            .ok_or(LaunchpadError::MathOverflow)?;
        let new_virtual_sol = u64::try_from(
            k.checked_div(new_virtual_token as u128)
                .ok_or(LaunchpadError::MathOverflow)?,
        )
        .map_err(|_| LaunchpadError::MathOverflow)?;
        let sol_out_gross = curve
            .virtual_sol_reserves
            .checked_sub(new_virtual_sol)
            .ok_or(LaunchpadError::MathOverflow)?;

        require!(sol_out_gross > 0, LaunchpadError::InvalidAmount);
        require!(
            sol_out_gross <= curve.real_sol_reserves,
            LaunchpadError::InsufficientLiquidity
        );

        let fee_total = fee_amount(sol_out_gross)?;
        let creator_fee = creator_share(fee_total)?;
        let protocol_fee = fee_total
            .checked_sub(creator_fee)
            .ok_or(LaunchpadError::MathOverflow)?;
        let sol_out_net = sol_out_gross
            .checked_sub(fee_total)
            .ok_or(LaunchpadError::MathOverflow)?;
        require!(sol_out_net >= min_sol_out, LaunchpadError::SlippageExceeded);

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            token_in,
            TOKEN_DECIMALS,
        )?;

        {
            let curve_ai = ctx.accounts.curve.to_account_info();
            let mut curve_lamports = curve_ai.try_borrow_mut_lamports()?;
            **curve_lamports = curve_lamports
                .checked_sub(sol_out_gross)
                .ok_or(LaunchpadError::MathOverflow)?;
        }
        **ctx
            .accounts
            .seller
            .to_account_info()
            .try_borrow_mut_lamports()? += sol_out_net;
        if protocol_fee > 0 {
            **ctx
                .accounts
                .treasury
                .to_account_info()
                .try_borrow_mut_lamports()? += protocol_fee;
        }
        if creator_fee > 0 {
            **ctx
                .accounts
                .creator
                .to_account_info()
                .try_borrow_mut_lamports()? += creator_fee;
        }

        let curve = &mut ctx.accounts.curve;
        curve.virtual_sol_reserves = new_virtual_sol;
        curve.virtual_token_reserves = new_virtual_token;
        curve.real_sol_reserves = curve
            .real_sol_reserves
            .checked_sub(sol_out_gross)
            .ok_or(LaunchpadError::MathOverflow)?;
        curve.real_token_reserves = curve
            .real_token_reserves
            .checked_add(token_in)
            .ok_or(LaunchpadError::MathOverflow)?;
        curve.complete = curve.real_token_reserves == 0;

        emit!(TradeEvent {
            mint: ctx.accounts.mint.key(),
            trader: ctx.accounts.seller.key(),
            is_buy: false,
            sol_amount: sol_out_gross,
            token_amount: token_in,
            creator_fee,
            protocol_fee,
            virtual_sol_reserves: curve.virtual_sol_reserves,
            virtual_token_reserves: curve.virtual_token_reserves,
            real_sol_reserves: curve.real_sol_reserves,
            real_token_reserves: curve.real_token_reserves,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

fn fee_amount(amount: u64) -> Result<u64> {
    u64::try_from(
        (amount as u128)
            .checked_mul(PLATFORM_FEE_BPS as u128)
            .ok_or(LaunchpadError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(LaunchpadError::MathOverflow)?,
    )
    .map_err(|_| LaunchpadError::MathOverflow.into())
}

fn creator_share(fee: u64) -> Result<u64> {
    u64::try_from(
        (fee as u128)
            .checked_mul(CREATOR_FEE_SHARE_BPS as u128)
            .ok_or(LaunchpadError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(LaunchpadError::MathOverflow)?,
    )
    .map_err(|_| LaunchpadError::MathOverflow.into())
}

#[derive(Accounts)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = curve,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + Curve::INIT_SPACE,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub curve: Account<'info, Curve>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    /// CHECK: created via CPI into the token metadata program below, validated by the seeds here
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: address-constrained to the real Metaplex Token Metadata program
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Account<'info, Curve>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    /// CHECK: only ever credited lamports, validated against curve.creator
    #[account(mut, address = curve.creator)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: PDA that only ever accrues lamports, no data
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
    )]
    pub curve: Account<'info, Curve>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    /// CHECK: only ever credited lamports, validated against curve.creator
    #[account(mut, address = curve.creator)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: PDA that only ever accrues lamports, no data
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Curve {
    pub mint: Pubkey,
    pub creator: Pubkey,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(200)]
    pub description: String,
    #[max_len(64)]
    pub website: String,
    #[max_len(64)]
    pub twitter: String,
    #[max_len(64)]
    pub telegram: String,
    pub curve_kind: u8,
    /// Reserves as set at creation — fixed forever, used to compute price change since launch.
    pub initial_virtual_sol_reserves: u64,
    pub initial_virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    /// Sellable supply at launch (total supply minus creator allocation) — fixed forever,
    /// used to compute "% of bonding curve sold" without needing off-chain indexing.
    pub initial_real_token_reserves: u64,
    pub token_total_supply: u64,
    pub created_at: i64,
    pub complete: bool,
    pub bump: u8,
}

#[event]
pub struct CreateEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub curve_kind: u8,
    pub timestamp: i64,
}

#[event]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub is_buy: bool,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub creator_fee: u64,
    pub protocol_fee: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum LaunchpadError {
    #[msg("Token name must be 1-32 characters")]
    NameTooLong,
    #[msg("Token symbol must be 1-10 characters")]
    SymbolTooLong,
    #[msg("Description must be 200 characters or fewer")]
    DescriptionTooLong,
    #[msg("Link fields must be 64 characters or fewer")]
    LinkTooLong,
    #[msg("Curve kind must be 0 (Linear) or 1 (Exponential)")]
    InvalidCurveKind,
    #[msg("Creator allocation cannot exceed 20% of supply")]
    AllocationTooHigh,
    #[msg("Initial price must be greater than zero")]
    InvalidPrice,
    #[msg("Total supply is out of the allowed range")]
    InvalidSupply,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("This token's bonding curve is sold out")]
    SoldOut,
    #[msg("Not enough SOL in this curve to cover that sale yet — tokens from the creator allocation aren't backed by real reserves until someone buys them")]
    InsufficientLiquidity,
    #[msg("Math overflow")]
    MathOverflow,
}
