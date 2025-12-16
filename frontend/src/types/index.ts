// Token metadata from tokenURI
export interface TokenMetadata {
  name: string;
  description: string;
  image: string;
  animation_url?: string;
  attributes: TokenAttribute[];
}

export interface TokenAttribute {
  trait_type: string;
  value: string | number;
}

// Fold data from contract
export interface Fold {
  startTime: bigint;
  endTime: bigint;
  blockHash: `0x${string}`;
}

// Token data from contract
export interface TokenData {
  foldId: bigint;
}

// Combined token info
export interface Token {
  id: number;
  foldId: number;
  seed: `0x${string}`;
  owner: `0x${string}`;
  metadata?: TokenMetadata;
}

// Mint window state
export interface MintWindowState {
  isActive: boolean;
  foldId: number;
  timeRemaining: number;
  price: bigint;
  hasMinted: boolean;
  canCreateFold: boolean;
}

// Strategy token stats
export interface TokenStats {
  tokenSupply: bigint;
  nftsMinted: number;
  foldCount: number;
  lastBurnTime: number;
  timeUntilNextBurn: number;
}
