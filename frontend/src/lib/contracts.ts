// Toggle test mode: set to true to use Sepolia testnet
const USE_TESTNET = true; // TODO: Set to false for mainnet launch

// Contract addresses - Sepolia Testnet
const TESTNET_CONTRACTS = {
  LESS_NFT: '0xEC7c87FD313546B96741FC24AC2236f181e49CF2' as `0x${string}`,
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
    name: 'currentFoldId',
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
    name: 'activeFoldId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'timeUntilWindowCloses',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'hasMintedFold',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'foldId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'canCreateFold',
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
    outputs: [{ name: 'foldId', type: 'uint64' }],
  },
  {
    name: 'getFold',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'foldId', type: 'uint256' }],
    outputs: [
      { name: 'startTime', type: 'uint64' },
      { name: 'endTime', type: 'uint64' },
      { name: 'blockHash', type: 'bytes32' },
    ],
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
    inputs: [],
    outputs: [],
  },
  {
    name: 'createFold',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // Events
  {
    name: 'FoldCreated',
    type: 'event',
    inputs: [
      { name: 'foldId', type: 'uint256', indexed: true },
      { name: 'startTime', type: 'uint64', indexed: false },
      { name: 'endTime', type: 'uint64', indexed: false },
      { name: 'blockHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    name: 'Minted',
    type: 'event',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'foldId', type: 'uint256', indexed: true },
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
