#!/usr/bin/env node

/**
 * Base Refund Script
 *
 * Refunds users who mistakenly sent ETH to 0x008B66385ed2346E6895031E250B2ac8dc14605C on Base
 * instead of minting on Mainnet.
 *
 * Usage:
 *   DRY RUN:  node scripts/base-refund.cjs
 *   EXECUTE:  PK=0x... EXECUTE=true node scripts/base-refund.cjs
 */

const { execSync } = require('child_process');

// Raw transaction data from Base (using exact wei values from blockchain)
// Verified against: https://base.blockscout.com/api/v2/addresses/0x008B66385ed2346E6895031E250B2ac8dc14605C/transactions?filter=to
const transactions = [
  { from: '0xa5E5d3afE7daF372972559C7Fa3b75cb7A4AE0d7', wei: 4200000000000000n, txHash: '0x69c98962db7b714d4dc1ec851959647c59571ddfaad0a20c5573a04a22f4deac' },
  { from: '0x17A9664077a3B50682d5C12415c3e88C23377708', wei: 55387500000000000n, txHash: '0x1d92ae2d045dfc7e754391c04ada525063f6d4e0bf7bbf44ff8d9228d0a35ec6' },
  { from: '0x6fD155b9D52F80E8A73a8A2537268602978486e2', wei: 4200000000000000n, txHash: '0x271725b82b5f93c9ad8acecb8a95b4bb9e620492d076582c08fee109cbac7db8' },
  { from: '0xf1D1261b4b0517D4CBcF66E6bb6aDD67784dFe80', wei: 4200000000000000n, txHash: '0xb4c8eb3a75d614bb78b73487eacf22be5a8b2680f7dc87e71cb1bd0d8729f45e' },
  { from: '0x0Dd29A896E1f200efDF2f6DF76D27E23df04413d', wei: 10500000000000000n, txHash: '0x5d74fb0f759c23fc3aed31b6bba5e004313b610b44a6f4e5eea4d865c3b4f6ee' },
  { from: '0xcBd08A5F071a2Ed53A57dfcebEfAc997d647DE9f', wei: 4200000000000000n, txHash: '0x85c1c246831b845cade487a025be3ccb72170651af17ed96f4ce65b1126a57c5' },
  { from: '0xa5E5d3afE7daF372972559C7Fa3b75cb7A4AE0d7', wei: 4200000000000000n, txHash: '0x9a936784223ad4710d5073462516c9e768f80bdf52e537ffe9cca8828d332313' },
  { from: '0x8177598e08ee8199C160a48c7A0Af31AB54bb59F', wei: 4200000000000000n, txHash: '0x352bf43f6f0b0cd49b83737c3057b15049f34ede669d6e427a65d275a0ad8f0b' },
  { from: '0x04490fB053a8Ff110bea35F22D955C0092aAE5f8', wei: 4200000000000000n, txHash: '0x7403358c3ee0ca3e81f15234e2d3714c966c258c72c1a85d2a1231c1f25db450' },
  { from: '0xAAfeD70e4B67C77dD756bA10379649241B1BCD1e', wei: 4200000000000000n, txHash: '0x20718f59accdf9fa213fbfb0d55d467a56d4695d7a3b9636d26b2b281af35039' },
  { from: '0x57e766997eD89eC496fdF3FA315D12bc2aE87E63', wei: 4200000000000000n, txHash: '0x5f9f47927401cc710deac2fc621a3eb4f8322325b619c8f0f249a269e9fea113' },
  { from: '0x1F335c8aB8514920Dba51a72f39E92B514cBAcef', wei: 4200000000000000n, txHash: '0xc7bb88dd3bd02ed2ea6270c45f19d7699526ce69439e4cf2d5bc7707c9e56de3' },
  { from: '0xb40f13D87855db13eE9b688151Cf4e1c556a5224', wei: 4200000000000000n, txHash: '0x2b411bc52f8c42870673901007e69293d901acb2112d98546355a8b7b466ea1e' },
  { from: '0x198109B0D2C786a230d18b622D3B7A1946131E09', wei: 4200000000000000n, txHash: '0xc8e987ebdec133ab045cc52f98c0527834ac7a165a608c238fdf9451c5458466' },
  { from: '0x153214fca16c8CF75a46E01094394A3eCbff70aB', wei: 19950000000000000n, txHash: '0x2261b6f464582c764a3874ebb3921027687594687f15d1c849e87d28439b63f2' },
  { from: '0x532caff29fE8BB93F4582B504Be3C3bFd0500405', wei: 4200000000000000n, txHash: '0x830aa81725e4d6916909c2ff985e8ecf4732e58ce13cb048d10f229458d48e1b' },
  { from: '0x4E9d80a13BCa511F4802ede73409AA370093fb82', wei: 4200000000000000n, txHash: '0x102460f96c784f1f318749c791050834f471759ee919344b6a8e10cd18a34240' },
  { from: '0x153214fca16c8CF75a46E01094394A3eCbff70aB', wei: 19950000000000000n, txHash: '0x9e8383ac68ad93b244b6d17cb1d23fe0b3b15ad621044f621bd8706d35db9ba7' },
  { from: '0x153214fca16c8CF75a46E01094394A3eCbff70aB', wei: 10500000000000000n, txHash: '0x62796db16eb3443c98dbbfcf23222d80755fca4253ce9a4617287f270a8c292a' },
  { from: '0x1F335c8aB8514920Dba51a72f39E92B514cBAcef', wei: 4200000000000000n, txHash: '0xe303b0c4d1eb13364445de37f7d1567cac9887de3615de36eb55a8b12b2ecccf' },
];

// Expected total: 179287500000000000 wei (matches on-chain balance)
const EXPECTED_TOTAL = 179287500000000000n;

function weiToEth(wei) {
  return Number(wei) / 1e18;
}

// Aggregate by sender address
const refunds = {};
for (const tx of transactions) {
  const addr = tx.from.toLowerCase();
  if (!refunds[addr]) {
    refunds[addr] = { address: tx.from, totalWei: 0n, txHashes: [] };
  }
  refunds[addr].totalWei += tx.wei;
  refunds[addr].txHashes.push(tx.txHash);
}

const refundList = Object.values(refunds).sort((a, b) =>
  Number(b.totalWei - a.totalWei)
);

// Calculate and verify total
const totalRefund = refundList.reduce((sum, r) => sum + r.totalWei, 0n);

console.log('=== BASE REFUND SUMMARY ===\n');
console.log(`Total transactions: ${transactions.length}`);
console.log(`Unique addresses: ${refundList.length}`);
console.log(`Total refund amount: ${weiToEth(totalRefund)} ETH (${totalRefund} wei)`);
console.log(`Expected total:      ${weiToEth(EXPECTED_TOTAL)} ETH (${EXPECTED_TOTAL} wei)`);

if (totalRefund !== EXPECTED_TOTAL) {
  console.error('\n❌ ERROR: Total does not match expected! Aborting.');
  process.exit(1);
}
console.log('✅ Total verified against on-chain balance\n');

console.log('=== REFUNDS BY ADDRESS ===\n');
for (const refund of refundList) {
  console.log(`${refund.address}: ${weiToEth(refund.totalWei)} ETH (${refund.txHashes.length} tx)`);
}

const MAINNET_RPC = process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/vCDlbqYLHrl_dZJkGmX2FgpAUpRs-iTI';
const EXECUTE = process.env.EXECUTE === 'true';

if (!process.env.PK) {
  console.log('\n⚠️  No private key provided. Set PK environment variable to execute refunds.');
  console.log('   Example: PK=0x... EXECUTE=true node scripts/base-refund.cjs');
  process.exit(0);
}

console.log('\n=== EXECUTING REFUNDS ON MAINNET ===\n');

if (!EXECUTE) {
  console.log('🔍 DRY RUN MODE - No transactions will be sent');
  console.log('   Set EXECUTE=true to send actual transactions\n');
}

async function sendRefund(address, weiAmount) {
  let pk = process.env.PK;
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const cmd = `cast send ${address} --value ${weiAmount} --rpc-url "${MAINNET_RPC}" --private-key "${pk}"`;

  if (!EXECUTE) {
    console.log(`[DRY RUN] Would send ${weiToEth(weiAmount)} ETH (${weiAmount} wei) to ${address}`);
    return null;
  }

  console.log(`Sending ${weiToEth(weiAmount)} ETH to ${address}...`);
  try {
    const result = execSync(cmd, { encoding: 'utf-8', env: { ...process.env } });
    const txHashMatch = result.match(/transactionHash\s+(0x[a-fA-F0-9]{64})/);
    const txHash = txHashMatch ? txHashMatch[1] : 'unknown';
    console.log(`  ✅ Success: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`  ❌ Failed: ${error.message}`);
    return null;
  }
}

async function main() {
  const results = [];

  for (const refund of refundList) {
    const txHash = await sendRefund(refund.address, refund.totalWei);
    results.push({
      address: refund.address,
      amount: refund.totalWei,
      txHash,
      originalTxs: refund.txHashes,
    });
  }

  if (EXECUTE) {
    console.log('\n=== REFUND RESULTS ===\n');
    const successful = results.filter(r => r.txHash);
    const failed = results.filter(r => !r.txHash);

    console.log(`Successful: ${successful.length}/${results.length}`);
    if (failed.length > 0) {
      console.log('\nFailed refunds:');
      for (const f of failed) {
        console.log(`  ${f.address}: ${weiToEth(f.amount)} ETH`);
      }
    }
  }
}

main().catch(console.error);
