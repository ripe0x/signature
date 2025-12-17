// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "solady/tokens/ERC721.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {ILessRenderer} from "../ILessRenderer.sol";

/// @title MockLessBot
/// @notice Mock Less contract for Twitter bot testing on Sepolia
/// @dev Owner can freely start/stop mint windows without any strategy
contract MockLessBot is ERC721, Ownable {
    struct Fold {
        uint64 startTime;
        uint64 endTime;
        bytes32 blockHash;
    }

    struct TokenData {
        uint64 foldId;
    }

    event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, bytes32 blockHash);
    event FoldEnded(uint256 indexed foldId);
    event Minted(uint256 indexed tokenId, uint256 indexed foldId, address indexed minter, bytes32 seed);

    error NoActiveMintWindow();
    error AlreadyMintedThisFold();
    error InvalidRenderer();

    uint256 public currentFoldId;
    uint256 public totalSupply;
    address public renderer;

    mapping(uint256 => Fold) public folds;
    mapping(uint256 => TokenData) public tokenData;
    mapping(uint256 => mapping(address => bool)) public hasMintedFold;

    constructor(address _owner) {
        _initializeOwner(_owner);
    }

    function name() public pure override returns (string memory) {
        return "LESS (Test)";
    }

    function symbol() public pure override returns (string memory) {
        return "LESS-TEST";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return ILessRenderer(renderer).tokenURI(tokenId);
    }

    function contractURI() external view returns (string memory) {
        return ILessRenderer(renderer).contractURI();
    }

    /// @notice Start a new mint window (owner only)
    /// @param duration Duration in seconds (e.g., 180 for 3 minutes)
    function startFold(uint256 duration) external onlyOwner {
        // End any active window first
        if (_isWindowActive()) {
            folds[currentFoldId].endTime = uint64(block.timestamp);
            emit FoldEnded(currentFoldId);
        }

        bytes32 blockHash = blockhash(block.number - 1);
        currentFoldId++;

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(duration);

        folds[currentFoldId] = Fold({
            startTime: startTime,
            endTime: endTime,
            blockHash: blockHash
        });

        emit FoldCreated(currentFoldId, startTime, endTime, blockHash);
    }

    /// @notice End the current mint window early (owner only)
    function endFold() external onlyOwner {
        if (_isWindowActive()) {
            folds[currentFoldId].endTime = uint64(block.timestamp);
            emit FoldEnded(currentFoldId);
        }
    }

    function isWindowActive() external view returns (bool) {
        return _isWindowActive();
    }

    function activeFoldId() external view returns (uint256) {
        return _isWindowActive() ? currentFoldId : 0;
    }

    function timeUntilWindowCloses() external view returns (uint256) {
        if (!_isWindowActive()) return 0;
        return folds[currentFoldId].endTime - block.timestamp;
    }

    /// @notice Mint a token (free, one per address per fold)
    function mint() external {
        if (!_isWindowActive()) revert NoActiveMintWindow();

        uint256 foldId = currentFoldId;
        if (hasMintedFold[foldId][msg.sender]) revert AlreadyMintedThisFold();

        hasMintedFold[foldId][msg.sender] = true;
        uint256 tokenId = ++totalSupply;
        tokenData[tokenId] = TokenData({foldId: uint64(foldId)});

        _mint(msg.sender, tokenId);

        bytes32 seed = keccak256(abi.encodePacked(folds[foldId].blockHash, tokenId));
        emit Minted(tokenId, foldId, msg.sender, seed);
    }

    /// @notice Owner mint to any address (bypasses one-per-fold limit)
    function mintTo(address to) external onlyOwner {
        if (!_isWindowActive()) revert NoActiveMintWindow();

        uint256 foldId = currentFoldId;
        uint256 tokenId = ++totalSupply;
        tokenData[tokenId] = TokenData({foldId: uint64(foldId)});

        _mint(to, tokenId);

        bytes32 seed = keccak256(abi.encodePacked(folds[foldId].blockHash, tokenId));
        emit Minted(tokenId, foldId, to, seed);
    }

    // ILess interface methods
    function getSeed(uint256 tokenId) external view returns (bytes32) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        uint256 foldId = tokenData[tokenId].foldId;
        return keccak256(abi.encodePacked(folds[foldId].blockHash, tokenId));
    }

    function getFold(uint256 foldId) external view returns (Fold memory) {
        return folds[foldId];
    }

    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return tokenData[tokenId];
    }

    function strategy() external pure returns (address) {
        return address(0);
    }

    function mintPrice() external pure returns (uint256) {
        return 0; // Free mint for testing
    }

    function setRenderer(address _renderer) external onlyOwner {
        if (_renderer == address(0)) revert InvalidRenderer();
        renderer = _renderer;
    }

    function _isWindowActive() internal view returns (bool) {
        if (currentFoldId == 0) return false;
        Fold storage fold = folds[currentFoldId];
        return block.timestamp >= fold.startTime && block.timestamp < fold.endTime;
    }
}
