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

// Token data from contract
export interface TokenData {
  windowId: bigint;
  seed: `0x${string}`;
}

// Combined token info
export interface Token {
  id: number;
  windowId: number;
  seed: `0x${string}`;
  owner: `0x${string}`;
  metadata?: TokenMetadata;
}

// Mint window state
export interface MintWindowState {
  isActive: boolean;
  windowId: number;
  timeRemaining: number;
  price: bigint;
  hasMinted: boolean;
  canCreateWindow: boolean;
}

// Strategy token stats
export interface TokenStats {
  tokenSupply: bigint;
  nftsMinted: number;
  windowCount: number;
  lastBurnTime: number;
  timeUntilNextBurn: number;
}
