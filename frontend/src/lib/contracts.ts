// Contract addresses - Ethereum Mainnet
export const CONTRACTS = {
  LESS_NFT: "0x008B66385ed2346E6895031E250B2ac8dc14605C" as `0x${string}`,
  LESS_STRATEGY: "0x9c2ca573009f181eac634c4d6e44a0977c24f335" as `0x${string}`,
} as const;

// Admin address
export const ADMIN_ADDRESS = "0xCB43078C32423F5348Cab5885911C3B5faE217F9" as `0x${string}`;

export const CHAIN_ID = 1;

// Token and NFT are both live
export const IS_TOKEN_LIVE = true;
export const IS_PRE_LAUNCH = false;

// Sample seeds for pre-launch preview
export const SAMPLE_SEEDS = [
  42069, 12345, 88888, 31415, 27182, 69420, 11111, 99999, 54321, 77777, 13579,
  24680,
] as const;

// Less NFT ABI - extracted from Less.sol
export const LESS_NFT_ABI = [
  // Read functions
  {
    name: "windowCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "minEthForWindow",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "mintPrice",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "isWindowActive",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "timeUntilWindowCloses",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getMintCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getMintCost",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "quantity", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "canCreateWindow",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getSeed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "getTokenData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "windowId", type: "uint64" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "windowDuration",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  // Admin read functions
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "payoutRecipient",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  // Write functions
  {
    name: "mint",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "createWindow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // Events
  {
    name: "WindowCreated",
    type: "event",
    inputs: [
      { name: "windowId", type: "uint256", indexed: true },
      { name: "startTime", type: "uint64", indexed: false },
      { name: "endTime", type: "uint64", indexed: false },
    ],
  },
  {
    name: "Minted",
    type: "event",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "windowId", type: "uint256", indexed: true },
      { name: "minter", type: "address", indexed: true },
      { name: "seed", type: "bytes32", indexed: false },
    ],
  },
] as const;

// Recursive Strategy ABI - extracted from IRecursiveStrategy.sol
export const STRATEGY_ABI = [
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "lastBurn",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "timeUntilFundsMoved",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "timeBetweenBurn",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Dead address for burn tracking
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;

// Bounty Factory (mainnet)
export const BOUNTY_FACTORY_ADDRESS = "0x8536a04b2606C9D14Ac1956fFB82Dc988E6e2c0D" as `0x${string}`;

// LessBountyFactory ABI
export const BOUNTY_FACTORY_ABI = [
  {
    name: "less",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "implementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "totalBounties",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getBounty",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "getAllBounties",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    name: "getBountyStatuses",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "start", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "bountyAddress", type: "address" },
          { name: "owner", type: "address" },
          { name: "canClaim", type: "bool" },
          { name: "reward", type: "uint256" },
          { name: "totalCost", type: "uint256" },
          { name: "balance", type: "uint256" },
          { name: "currentWindowId", type: "uint256" },
          { name: "windowActive", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "createBounty",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "createAndConfigure",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "mintsPerWindow", type: "uint256" },
      { name: "executorReward", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    name: "BountyCreated",
    type: "event",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "bounty", type: "address", indexed: true },
    ],
  },
] as const;

// LessBounty ABI (individual bounty contract)
export const BOUNTY_ABI = [
  {
    name: "less",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "mintsPerWindow",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "executorReward",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "paused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "specificWindowsOnly",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "windowMinted",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "windowId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "targetWindows",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "windowId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "canExecute",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "canClaim", type: "bool" },
      { name: "reason", type: "string" },
    ],
  },
  {
    name: "getBountyStatus",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "isActive", type: "bool" },
      { name: "isPaused", type: "bool" },
      { name: "currentWindowId", type: "uint256" },
      { name: "windowActive", type: "bool" },
      { name: "windowMintedAlready", type: "bool" },
      { name: "windowTargeted", type: "bool" },
      { name: "canClaim", type: "bool" },
      { name: "mintCost", type: "uint256" },
      { name: "reward", type: "uint256" },
      { name: "totalCost", type: "uint256" },
      { name: "balance", type: "uint256" },
      { name: "configuredMintsPerWindow", type: "uint256" },
    ],
  },
  {
    name: "getExecutionCost",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "mintCost", type: "uint256" },
      { name: "reward", type: "uint256" },
      { name: "total", type: "uint256" },
    ],
  },
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "configure",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_mintsPerWindow", type: "uint256" },
      { name: "_executorReward", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "setPaused",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_paused", type: "bool" }],
    outputs: [],
  },
  {
    name: "setSpecificWindowsOnly",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_enabled", type: "bool" }],
    outputs: [],
  },
  {
    name: "setTargetWindow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "windowId", type: "uint256" },
      { name: "enabled", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "BountyExecuted",
    type: "event",
    inputs: [
      { name: "executor", type: "address", indexed: true },
      { name: "windowId", type: "uint256", indexed: false },
      { name: "quantity", type: "uint256", indexed: false },
      { name: "reward", type: "uint256", indexed: false },
    ],
  },
] as const;
