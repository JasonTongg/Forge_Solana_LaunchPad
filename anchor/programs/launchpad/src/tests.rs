#[cfg(test)]
mod tests {
    use crate::{Curve, ID as PROGRAM_ID};
    use anchor_lang::{AccountDeserialize, AnchorSerialize};
    use litesvm::LiteSVM;
    use solana_sdk::{
        hash::hash,
        instruction::{AccountMeta, Instruction},
        program_pack::Pack,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use solana_system_interface::program::ID as SYSTEM_PROGRAM_ID;
    use spl_associated_token_account_client::{
        address::get_associated_token_address, program::ID as ATA_PROGRAM_ID,
    };
    use spl_token::state::{Account as SplTokenAccount, Mint as SplMint};

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

    struct CreateArgs {
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
    }

    impl Default for CreateArgs {
        fn default() -> Self {
            Self {
                name: "Degen Cat".to_string(),
                symbol: "DCAT".to_string(),
                description: "The internet's favorite degen mascot.".to_string(),
                website: "".to_string(),
                twitter: "".to_string(),
                telegram: "".to_string(),
                curve_kind: 1, // exponential
                creator_alloc_bps: 0,
                initial_price_lamports: 1,
                total_supply_whole_tokens: 1_000_000_000,
            }
        }
    }

    fn discriminator(name: &str) -> [u8; 8] {
        let hashed = hash(format!("global:{name}").as_bytes());
        let bytes = hashed.to_bytes();
        let mut out = [0u8; 8];
        out.copy_from_slice(&bytes[..8]);
        out
    }

    fn curve_pda(mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"curve", mint.as_ref()], &PROGRAM_ID)
    }

    fn treasury_pda() -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"treasury"], &PROGRAM_ID)
    }

    fn metadata_pda(mint: &Pubkey) -> Pubkey {
        mpl_token_metadata::accounts::Metadata::find_pda(mint).0
    }

    fn create_token_ix(creator: &Pubkey, mint: &Pubkey, args: &CreateArgs) -> Instruction {
        let (curve, _) = curve_pda(mint);
        let curve_token_vault = get_associated_token_address(&curve, mint);
        let creator_token_account = get_associated_token_address(creator, mint);
        let metadata = metadata_pda(mint);

        let mut data = discriminator("create_token").to_vec();
        args.name.serialize(&mut data).unwrap();
        args.symbol.serialize(&mut data).unwrap();
        args.description.serialize(&mut data).unwrap();
        args.website.serialize(&mut data).unwrap();
        args.twitter.serialize(&mut data).unwrap();
        args.telegram.serialize(&mut data).unwrap();
        args.curve_kind.serialize(&mut data).unwrap();
        args.creator_alloc_bps.serialize(&mut data).unwrap();
        args.initial_price_lamports.serialize(&mut data).unwrap();
        args.total_supply_whole_tokens.serialize(&mut data).unwrap();

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*creator, true),
                AccountMeta::new(*mint, true),
                AccountMeta::new(curve, false),
                AccountMeta::new(curve_token_vault, false),
                AccountMeta::new(creator_token_account, false),
                AccountMeta::new(metadata, false),
                AccountMeta::new_readonly(mpl_token_metadata::ID, false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(ATA_PROGRAM_ID, false),
                AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
            ],
            data,
        }
    }

    fn buy_ix(
        buyer: &Pubkey,
        mint: &Pubkey,
        creator: &Pubkey,
        sol_in: u64,
        min_token_out: u64,
    ) -> Instruction {
        let (curve, _) = curve_pda(mint);
        let (treasury, _) = treasury_pda();
        let curve_token_vault = get_associated_token_address(&curve, mint);
        let buyer_token_account = get_associated_token_address(buyer, mint);

        let mut data = discriminator("buy").to_vec();
        sol_in.serialize(&mut data).unwrap();
        min_token_out.serialize(&mut data).unwrap();

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*buyer, true),
                AccountMeta::new_readonly(*mint, false),
                AccountMeta::new(curve, false),
                AccountMeta::new(curve_token_vault, false),
                AccountMeta::new(buyer_token_account, false),
                AccountMeta::new(*creator, false),
                AccountMeta::new(treasury, false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(ATA_PROGRAM_ID, false),
                AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
            ],
            data,
        }
    }

    fn sell_ix(
        seller: &Pubkey,
        mint: &Pubkey,
        creator: &Pubkey,
        token_in: u64,
        min_sol_out: u64,
    ) -> Instruction {
        let (curve, _) = curve_pda(mint);
        let (treasury, _) = treasury_pda();
        let curve_token_vault = get_associated_token_address(&curve, mint);
        let seller_token_account = get_associated_token_address(seller, mint);

        let mut data = discriminator("sell").to_vec();
        token_in.serialize(&mut data).unwrap();
        min_sol_out.serialize(&mut data).unwrap();

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*seller, true),
                AccountMeta::new_readonly(*mint, false),
                AccountMeta::new(curve, false),
                AccountMeta::new(curve_token_vault, false),
                AccountMeta::new(seller_token_account, false),
                AccountMeta::new(*creator, false),
                AccountMeta::new(treasury, false),
                AccountMeta::new_readonly(spl_token::ID, false),
            ],
            data,
        }
    }

    fn new_svm_with_program() -> LiteSVM {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/launchpad.so");
        svm.add_program(PROGRAM_ID, program_bytes)
            .expect("failed to load launchpad program");

        // Not one of LiteSVM's bundled default programs, so a real dump is checked in for tests.
        let mpl_bytes = include_bytes!("../tests/fixtures/mpl_token_metadata.so");
        svm.add_program(mpl_token_metadata::ID, mpl_bytes)
            .expect("failed to load mpl-token-metadata program");
        svm
    }

    fn get_curve(svm: &LiteSVM, curve: &Pubkey) -> Curve {
        let account = svm.get_account(curve).expect("curve account missing");
        Curve::try_deserialize(&mut account.data.as_slice()).expect("failed to decode curve")
    }

    fn get_token_amount(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
        let account = svm
            .get_account(token_account)
            .expect("token account missing");
        SplTokenAccount::unpack(&account.data).unwrap().amount
    }

    fn create_test_token(svm: &mut LiteSVM, creator: &Keypair, args: CreateArgs) -> Pubkey {
        let mint = Keypair::new();
        let ix = create_token_ix(&creator.pubkey(), &mint.pubkey(), &args);

        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&creator.pubkey()),
            &[creator, &mint],
            blockhash,
        );

        svm.send_transaction(tx).expect("create_token should succeed");
        mint.pubkey()
    }

    #[test]
    fn test_create_token_mints_fixed_supply() {
        let mut svm = new_svm_with_program();
        let creator = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let mint = create_test_token(&mut svm, &creator, CreateArgs::default());
        let (curve_addr, _) = curve_pda(&mint);
        let curve = get_curve(&svm, &curve_addr);

        assert_eq!(curve.mint, mint);
        assert_eq!(curve.creator, creator.pubkey());
        assert_eq!(curve.name, "Degen Cat");
        assert_eq!(curve.symbol, "DCAT");
        assert_eq!(curve.curve_kind, 1);
        assert!(curve.virtual_sol_reserves > 0);
        assert_eq!(curve.real_token_reserves, curve.token_total_supply);
        assert!(!curve.complete);

        // Total supply is fully accounted for in the curve's own vault (no creator allocation).
        let vault = get_associated_token_address(&curve_addr, &mint);
        assert_eq!(get_token_amount(&svm, &vault), curve.token_total_supply);

        // Mint authority must be revoked so supply is fixed forever.
        let mint_account = svm.get_account(&mint).unwrap();
        let mint_state = SplMint::unpack(&mint_account.data).unwrap();
        assert!(mint_state.mint_authority.is_none());
        assert_eq!(mint_state.supply, curve.token_total_supply);

        // Wallets read name/symbol from the Metaplex metadata account, not just our Curve account.
        let metadata_account = svm.get_account(&metadata_pda(&mint)).unwrap();
        let metadata = mpl_token_metadata::accounts::Metadata::from_bytes(&metadata_account.data)
            .expect("failed to decode metadata account");
        assert_eq!(metadata.name.trim_end_matches('\0'), "Degen Cat");
        assert_eq!(metadata.symbol.trim_end_matches('\0'), "DCAT");
        assert_eq!(metadata.mint, mint);
    }

    #[test]
    fn test_create_token_sends_creator_allocation() {
        let mut svm = new_svm_with_program();
        let creator = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let args = CreateArgs {
            creator_alloc_bps: 500, // 5%
            ..CreateArgs::default()
        };
        let mint = create_test_token(&mut svm, &creator, args);
        let (curve_addr, _) = curve_pda(&mint);
        let curve = get_curve(&svm, &curve_addr);

        let creator_ata = get_associated_token_address(&creator.pubkey(), &mint);
        let creator_balance = get_token_amount(&svm, &creator_ata);
        let expected_alloc = curve.token_total_supply / 20; // 5%

        assert_eq!(creator_balance, expected_alloc);
        assert_eq!(curve.real_token_reserves, curve.token_total_supply - expected_alloc);
    }

    #[test]
    fn test_buy_then_sell_round_trip() {
        let mut svm = new_svm_with_program();
        let creator = Keypair::new();
        let buyer = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
        svm.airdrop(&buyer.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let mint = create_test_token(&mut svm, &creator, CreateArgs::default());
        let (curve_addr, _) = curve_pda(&mint);
        let before = get_curve(&svm, &curve_addr);
        let creator_balance_before_buy = svm.get_balance(&creator.pubkey()).unwrap();

        let sol_in = LAMPORTS_PER_SOL; // 1 SOL
        let buy = buy_ix(&buyer.pubkey(), &mint, &creator.pubkey(), sol_in, 1);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(&[buy], Some(&buyer.pubkey()), &[&buyer], blockhash);
        svm.send_transaction(tx).expect("buy should succeed");

        let after_buy = get_curve(&svm, &curve_addr);
        assert!(after_buy.real_token_reserves < before.real_token_reserves);
        assert!(after_buy.real_sol_reserves > 0);
        assert!(after_buy.real_sol_reserves < sol_in); // fee was skimmed off

        let buyer_ata = get_associated_token_address(&buyer.pubkey(), &mint);
        let tokens_received = get_token_amount(&svm, &buyer_ata);
        assert_eq!(
            tokens_received,
            before.real_token_reserves - after_buy.real_token_reserves
        );

        // Creator earned half the trading fee directly in their wallet.
        let creator_balance_after = svm.get_balance(&creator.pubkey()).unwrap();
        assert!(creator_balance_after > creator_balance_before_buy);

        // Sell half of what was bought back into the curve.
        let sell_amount = tokens_received / 2;
        let sell = sell_ix(&buyer.pubkey(), &mint, &creator.pubkey(), sell_amount, 1);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(&[sell], Some(&buyer.pubkey()), &[&buyer], blockhash);
        svm.send_transaction(tx).expect("sell should succeed");

        let after_sell = get_curve(&svm, &curve_addr);
        assert!(after_sell.real_token_reserves > after_buy.real_token_reserves);
        assert!(after_sell.real_sol_reserves < after_buy.real_sol_reserves);

        let remaining_tokens = get_token_amount(&svm, &buyer_ata);
        assert_eq!(remaining_tokens, tokens_received - sell_amount);
    }

    #[test]
    fn test_buy_rejects_slippage() {
        let mut svm = new_svm_with_program();
        let creator = Keypair::new();
        let buyer = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
        svm.airdrop(&buyer.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let mint = create_test_token(&mut svm, &creator, CreateArgs::default());

        // An unreasonably high min_token_out can never be satisfied.
        let buy = buy_ix(
            &buyer.pubkey(),
            &mint,
            &creator.pubkey(),
            LAMPORTS_PER_SOL,
            u64::MAX,
        );
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(&[buy], Some(&buyer.pubkey()), &[&buyer], blockhash);
        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "buy should fail slippage check");
    }

    #[test]
    fn test_buy_rejects_when_exceeding_available_reserves() {
        let mut svm = new_svm_with_program();
        let creator = Keypair::new();
        let buyer = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
        svm.airdrop(&buyer.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let mint = create_test_token(&mut svm, &creator, CreateArgs::default());

        // A wildly oversized buy would need more tokens than the curve holds for sale.
        let buy = buy_ix(
            &buyer.pubkey(),
            &mint,
            &creator.pubkey(),
            1_000 * LAMPORTS_PER_SOL,
            0,
        );
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(&[buy], Some(&buyer.pubkey()), &[&buyer], blockhash);
        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "buy should fail, not enough tokens left to sell");
    }

    #[test]
    fn test_create_token_rejects_allocation_over_cap() {
        let mut svm = new_svm_with_program();
        let creator = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let mint = Keypair::new();
        let args = CreateArgs {
            creator_alloc_bps: 5_000, // 50%, above the 20% cap
            ..CreateArgs::default()
        };
        let ix = create_token_ix(&creator.pubkey(), &mint.pubkey(), &args);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&creator.pubkey()),
            &[&creator, &mint],
            blockhash,
        );
        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "allocation above 20% should be rejected");
    }
}
