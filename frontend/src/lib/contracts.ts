// Toggle test mode: set to true to use Sepolia testnet
const USE_TESTNET = true; // TODO: Set to false for mainnet launch

// Contract addresses - Sepolia Testnet
const TESTNET_CONTRACTS = {
  LESS_NFT: '0x8755aaC64b0C0af73f8484BB2550ceD2509b25aE' as `0x${string}`,
  LESS_STRATEGY: '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const;

// Contract addresses - Ethereum Mainnet
// TODO: Replace with actual deployed addresses
const MAINNET_CONTRACTS = {
  LESS_NFT: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  LESS_STRATEGY: '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const;

export const CONTRACTS = USE_TESTNET ? TESTNET_CONTRACTS : MAINNET_CONTRACTS;
export const CHAIN_ID = USE_TESTNET ? 11155111 : 1; // Sepolia or Mainnet

// Zero address for comparison
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Automatically detect pre-launch mode based on contract addresses
// In testnet mode, only NFT address is required (no strategy on Sepolia)
export const IS_PRE_LAUNCH = USE_TESTNET
  ? CONTRACTS.LESS_NFT === ZERO_ADDRESS
  : CONTRACTS.LESS_NFT === ZERO_ADDRESS || CONTRACTS.LESS_STRATEGY === ZERO_ADDRESS;

// Sample seeds for pre-launch preview
export const SAMPLE_SEEDS = [
  42069,
  12345,
  88888,
  31415,
  27182,
  69420,
  11111,
  99999,
  54321,
  77777,
  13579,
  24680,
] as const;

// Less NFT ABI - extracted from Less.sol
export const LESS_NFT_ABI = [
  // Read functions
  {
    name: 'windowCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'mintPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'isWindowActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'timeUntilWindowCloses',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getMintCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getMintCost',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'quantity', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'canCreateWindow',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'getSeed',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'bytes32' }],
  },
  {
    name: 'getTokenData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'windowId', type: 'uint64' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'windowDuration',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Write functions
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'quantity', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'createWindow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // Events
  {
    name: 'WindowCreated',
    type: 'event',
    inputs: [
      { name: 'windowId', type: 'uint256', indexed: true },
      { name: 'startTime', type: 'uint64', indexed: false },
      { name: 'endTime', type: 'uint64', indexed: false },
    ],
  },
  {
    name: 'Minted',
    type: 'event',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'windowId', type: 'uint256', indexed: true },
      { name: 'minter', type: 'address', indexed: true },
      { name: 'seed', type: 'bytes32', indexed: false },
    ],
  },
] as const;

// Recursive Strategy ABI - extracted from IRecursiveStrategy.sol
export const STRATEGY_ABI = [
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'lastBurn',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'timeUntilFundsMoved',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'timeBetweenBurn',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;
