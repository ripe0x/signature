#!/usr/bin/env node
/**
 * Send LESS tokens to Window 19 Bounty Owners
 *
 * Prerequisites: Run `node scripts/fetch-secondary-tokens.js` first
 *
 * Usage:
 *   DRY_RUN=1 node scripts/send-bounty-rewards.js  # Preview transfers
 *   node scripts/send-bounty-rewards.js            # Execute transfers
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import 'dotenv/config';

const RPC_URL = process.env.MAINNET_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const LESS_CONTRACT = '0x008B66385ed2346E6895031E250B2ac8dc14605C';
const YOUR_ADDRESS = '0xCB43078C32423F5348Cab5885911C3B5faE217F9';
const DRY_RUN = process.env.DRY_RUN === '1';

// Remaining bounty owners from windows 16-18 (window 19 all sent)
// SENT: batz.eth (#127), 1505.eth, mikegee.eth, incarterseyes.eth,
//       cypherdao.eth, dtodd.eth, grunt.eth, joafen82.eth, 0.kvlt.eth
const RECIPIENTS = [
  { address: '0xD3D1F692275FedB9Cf23C419cF03b3BD3565485C', ens: '(no ENS - w16,17)' },
  { address: '0xbe99E01D0BBFB80e12A88ecC9619D8223c6925b9', ens: '(no ENS - w18)' },
];

function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     LESS Token Transfer to Window 19 Bounty Owners         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Mode:       ${DRY_RUN ? '🔍 DRY RUN (no transfers)' : '🚀 LIVE (will transfer!)'}`);
  console.log(`  From:       ${YOUR_ADDRESS}`);
  console.log(`  Recipients: ${RECIPIENTS.length}`);
  console.log('');

  // Load cached secondary tokens
  if (!existsSync('secondary-tokens.json')) {
    console.error('❌ secondary-tokens.json not found. Run first:');
    console.error('   node scripts/fetch-secondary-tokens.js');
    process.exit(1);
  }

  const cache = JSON.parse(readFileSync('secondary-tokens.json', 'utf-8'));
  const secondaryTokens = cache.tokens;

  console.log(`📦 Secondary tokens: [${secondaryTokens.join(', ')}]`);
  console.log(`   (cached at ${cache.fetchedAt})`);
  console.log('');

  if (secondaryTokens.length < RECIPIENTS.length) {
    console.error(`❌ Not enough secondary tokens (${secondaryTokens.length}) for ${RECIPIENTS.length} recipients`);
    process.exit(1);
  }

  // Display transfer plan
  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│                      TRANSFER PLAN                         │');
  console.log('├────────┬───────────────────────────────────────────────────┤');

  const transfers = RECIPIENTS.map((r, i) => ({
    tokenId: secondaryTokens[i],
    to: r.address,
    ens: r.ens,
  }));

  for (const t of transfers) {
    console.log(`│ #${String(t.tokenId).padEnd(5)} │ → ${t.ens.padEnd(20)} (${t.to.slice(0,10)}...) │`);
  }

  console.log('└────────┴───────────────────────────────────────────────────┘');
  console.log('');

  if (DRY_RUN) {
    console.log('✅ Dry run complete. Run without DRY_RUN=1 to execute transfers.');
    return;
  }

  if (!RPC_URL) {
    console.error('❌ MAINNET_RPC_URL not set in .env');
    process.exit(1);
  }

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  // Execute transfers
  console.log('🚀 EXECUTING TRANSFERS...\n');

  for (let i = 0; i < transfers.length; i++) {
    const { tokenId, to, ens } = transfers[i];
    process.stdout.write(`   [${i + 1}/${transfers.length}] Token #${tokenId} → ${ens}... `);

    try {
      const cmd = `cast send --rpc-url "${RPC_URL}" --private-key "${PRIVATE_KEY}" ` +
        `${LESS_CONTRACT} "safeTransferFrom(address,address,uint256)" ` +
        `${YOUR_ADDRESS} ${to} ${tokenId}`;

      const output = execSync(cmd, { encoding: 'utf-8' });
      const txMatch = output.match(/transactionHash\s+(\S+)/);
      const txHash = txMatch ? txMatch[1] : 'done';
      console.log(`✅ ${txHash.slice(0, 18)}...`);
    } catch (e) {
      console.log(`❌ FAILED`);
      console.error(`      Error: ${e.message}`);
      process.exit(1);
    }
  }

  console.log('\n🎉 ALL TRANSFERS COMPLETE!\n');
}

main();
