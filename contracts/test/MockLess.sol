// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockLess
/// @notice Minimal mock of the Less NFT contract for testing LessRenderer on Sepolia
/// @dev Implements only the interface methods that LessRenderer needs
contract MockLess {
    struct Fold {
        uint64 startTime;
        uint64 endTime;
        bytes32 blockHash;
    }

    struct TokenData {
        uint64 foldId;
    }

    address public owner;
    mapping(uint256 => bytes32) private _seeds;
    mapping(uint256 => TokenData) private _tokens;
    mapping(uint256 => Fold) private _folds;

    event SeedSet(uint256 indexed tokenId, bytes32 seed);
    event TokenCreated(uint256 indexed tokenId, uint64 foldId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Set a test seed for a token
    /// @param tokenId The token ID to set seed for
    /// @param seed The seed value (bytes32)
    function setSeed(uint256 tokenId, bytes32 seed) external onlyOwner {
        _seeds[tokenId] = seed;
        // Auto-create token data if not exists
        if (_tokens[tokenId].foldId == 0) {
            _tokens[tokenId] = TokenData(uint64(tokenId));
        }
        emit SeedSet(tokenId, seed);
    }

    /// @notice Set seed using a simple uint256 (easier for testing)
    /// @param tokenId The token ID
    /// @param seedNum A number that will be hashed to create the seed
    function setSeedFromNumber(uint256 tokenId, uint256 seedNum) external onlyOwner {
        bytes32 seed = keccak256(abi.encodePacked(seedNum, tokenId));
        _seeds[tokenId] = seed;
        if (_tokens[tokenId].foldId == 0) {
            _tokens[tokenId] = TokenData(uint64(tokenId));
        }
        emit SeedSet(tokenId, seed);
    }

    /// @notice Batch set multiple test tokens
    /// @param startTokenId Starting token ID
    /// @param count Number of tokens to create
    function batchCreateTokens(uint256 startTokenId, uint256 count) external onlyOwner {
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = startTokenId + i;
            bytes32 seed = keccak256(abi.encodePacked(block.timestamp, tokenId, i));
            _seeds[tokenId] = seed;
            _tokens[tokenId] = TokenData(uint64(tokenId));
            emit SeedSet(tokenId, seed);
            emit TokenCreated(tokenId, uint64(tokenId));
        }
    }

    /// @notice Set token data explicitly
    function setTokenData(uint256 tokenId, uint64 foldId) external onlyOwner {
        _tokens[tokenId] = TokenData(foldId);
        emit TokenCreated(tokenId, foldId);
    }

    /// @notice Set fold data
    function setFold(uint256 foldId, uint64 startTime, uint64 endTime, bytes32 blockHash) external onlyOwner {
        _folds[foldId] = Fold(startTime, endTime, blockHash);
    }

    // ============ ILess Interface Methods (called by LessRenderer) ============

    /// @notice Get the seed for a token
    function getSeed(uint256 tokenId) external view returns (bytes32) {
        bytes32 seed = _seeds[tokenId];
        require(seed != bytes32(0), "Token does not exist");
        return seed;
    }

    /// @notice Get token data
    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        require(_seeds[tokenId] != bytes32(0), "Token does not exist");
        return _tokens[tokenId];
    }

    /// @notice Get fold data
    function getFold(uint256 foldId) external view returns (Fold memory) {
        return _folds[foldId];
    }

    /// @notice Returns zero address (no strategy on testnet)
    function strategy() external pure returns (address) {
        return address(0);
    }

    // ============ Admin ============

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
