// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "solady/tokens/ERC721.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {IRecursiveStrategy} from "./IRecursiveStrategy.sol";
import {ILessRenderer} from "./ILessRenderer.sol";

/// @title Less
/// @notice ERC721 collection tied to RecursiveStrategy burn events
/// @dev Each fold event opens a time-limited mint window; one mint per address per fold
contract Less is ERC721, Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Data for each fold event / mint window
    struct Fold {
        uint64 startTime;      // When the mint window opens
        uint64 endTime;        // When the mint window closes
        uint64 strategyBlock;  // Block number when the burn was triggered
    }

    /// @notice Per-token data stored on mint
    struct TokenData {
        uint64 foldId;         // Which fold this token belongs to
        bytes32 seed;          // Deterministic seed for rendering
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, uint64 strategyBlock);
    event Minted(uint256 indexed tokenId, uint256 indexed foldId, address indexed minter, bytes32 seed);
    event MintPriceUpdated(uint256 newPrice);
    event PayoutRecipientUpdated(address newRecipient);
    event RendererUpdated(address newRenderer);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error MintWindowActive();
    error NoActiveMintWindow();
    error AlreadyMintedThisFold();
    error InsufficientPayment();
    error InvalidPayoutRecipient();
    error TransferFailed();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Reference to the RecursiveStrategy token
    IRecursiveStrategy public immutable strategy;

    /// @notice Duration of each mint window (read from strategy at deployment)
    uint256 public immutable windowDuration;

    /// @notice Current fold ID (starts at 0, incremented on each fold)
    uint256 public currentFoldId;

    /// @notice Total number of tokens minted
    uint256 public totalSupply;

    /// @notice Price in wei to mint one token
    uint256 public mintPrice;

    /// @notice Recipient of mint payments
    address public payoutRecipient;

    /// @notice External renderer contract for tokenURI
    address public renderer;

    /// @notice Mapping of fold ID to fold data
    mapping(uint256 => Fold) public folds;

    /// @notice Mapping of token ID to token data
    mapping(uint256 => TokenData) public tokenData;

    /// @notice Tracks which addresses have minted for each fold
    /// @dev foldId => minter => hasMinted
    mapping(uint256 => mapping(address => bool)) public hasMintedFold;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param _strategy Address of the RecursiveStrategy token
    /// @param _mintPrice Initial mint price in wei
    /// @param _payoutRecipient Initial recipient for mint payments
    /// @param _owner Contract owner
    constructor(
        address _strategy,
        uint256 _mintPrice,
        address _payoutRecipient,
        address _owner
    ) {
        if (_payoutRecipient == address(0)) revert InvalidPayoutRecipient();

        strategy = IRecursiveStrategy(_strategy);
        windowDuration = IRecursiveStrategy(_strategy).timeBetweenBurn();
        mintPrice = _mintPrice;
        payoutRecipient = _payoutRecipient;

        _initializeOwner(_owner);
    }

    /*//////////////////////////////////////////////////////////////
                            ERC721 METADATA
    //////////////////////////////////////////////////////////////*/

    function name() public pure override returns (string memory) {
        return "less";
    }

    function symbol() public pure override returns (string memory) {
        return "LESS";
    }

    /// @notice Returns the token URI by delegating to the renderer
    /// @param tokenId The token to get metadata for
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return ILessRenderer(renderer).tokenURI(tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                           FOLD MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates a new fold by triggering a burn on the strategy
    /// @dev Anyone can call this; will revert if a mint window is active or strategy burn fails
    function createFold() external nonReentrant {
        // Check no active mint window
        if (_isWindowActive()) revert MintWindowActive();

        // Record the block before calling strategy (this is the strategyBlock)
        uint64 strategyBlock = uint64(block.number);

        // Trigger the burn on the strategy
        // This will revert if:
        // - No ETH available for TWAP (NoETHToTwap)
        // - Not enough blocks since last TWAP (TwapDelayNotMet)
        // The strategy team will configure the strategy so only this contract
        // can call processTokenTwap (via distributor whitelist or similar)
        strategy.processTokenTwap();

        // Increment fold ID (starts at 1)
        currentFoldId++;

        // Record fold data
        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(windowDuration);

        folds[currentFoldId] = Fold({
            startTime: startTime,
            endTime: endTime,
            strategyBlock: strategyBlock
        });

        emit FoldCreated(currentFoldId, startTime, endTime, strategyBlock);
    }

    /// @notice Check if there is currently an active mint window
    function isWindowActive() external view returns (bool) {
        return _isWindowActive();
    }

    /// @notice Get the current active fold ID (0 if no window active)
    function activeFoldId() external view returns (uint256) {
        if (_isWindowActive()) {
            return currentFoldId;
        }
        return 0;
    }

    /*//////////////////////////////////////////////////////////////
                              MINTING
    //////////////////////////////////////////////////////////////*/

    /// @notice Mint a token for the current active fold
    /// @dev One mint per address per fold; requires exact payment
    function mint() external payable nonReentrant {
        // Check active window
        if (!_isWindowActive()) revert NoActiveMintWindow();

        uint256 foldId = currentFoldId;

        // Check not already minted this fold
        if (hasMintedFold[foldId][msg.sender]) revert AlreadyMintedThisFold();

        // Check payment
        if (msg.value < mintPrice) revert InsufficientPayment();

        // Mark as minted for this fold
        hasMintedFold[foldId][msg.sender] = true;

        // Generate token ID and increment supply
        uint256 tokenId = ++totalSupply;

        // Generate deterministic seed from fold's strategy block hash and token data
        bytes32 seed = _generateSeed(foldId, tokenId);

        // Store token data
        tokenData[tokenId] = TokenData({
            foldId: uint64(foldId),
            seed: seed
        });

        // Mint the token
        _mint(msg.sender, tokenId);

        // Forward payment to payout recipient
        SafeTransferLib.forceSafeTransferETH(payoutRecipient, msg.value);

        emit Minted(tokenId, foldId, msg.sender, seed);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the fold ID for a token
    function getFoldId(uint256 tokenId) external view returns (uint256) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return tokenData[tokenId].foldId;
    }

    /// @notice Get the seed for a token
    function getSeed(uint256 tokenId) external view returns (bytes32) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return tokenData[tokenId].seed;
    }

    /// @notice Get full fold data
    function getFold(uint256 foldId) external view returns (Fold memory) {
        return folds[foldId];
    }

    /// @notice Get full token data
    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return tokenData[tokenId];
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Update the mint price
    /// @param _mintPrice New price in wei
    function setMintPrice(uint256 _mintPrice) external onlyOwner {
        mintPrice = _mintPrice;
        emit MintPriceUpdated(_mintPrice);
    }

    /// @notice Update the payout recipient
    /// @param _payoutRecipient New recipient address
    function setPayoutRecipient(address _payoutRecipient) external onlyOwner {
        if (_payoutRecipient == address(0)) revert InvalidPayoutRecipient();
        payoutRecipient = _payoutRecipient;
        emit PayoutRecipientUpdated(_payoutRecipient);
    }

    /// @notice Update the renderer contract
    /// @param _renderer New renderer address
    function setRenderer(address _renderer) external onlyOwner {
        renderer = _renderer;
        emit RendererUpdated(_renderer);
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if there is an active mint window
    function _isWindowActive() internal view returns (bool) {
        if (currentFoldId == 0) return false;
        Fold storage fold = folds[currentFoldId];
        return block.timestamp >= fold.startTime && block.timestamp < fold.endTime;
    }

    /// @notice Generate a deterministic seed for a token
    /// @dev Uses the blockhash from the fold's strategy block combined with token data
    /// @param foldId The fold this token belongs to
    /// @param tokenId The token ID being minted
    function _generateSeed(uint256 foldId, uint256 tokenId) internal view returns (bytes32) {
        Fold storage fold = folds[foldId];

        // Get the blockhash of the strategy block
        // Note: blockhash only works for the last 256 blocks
        // If the strategyBlock is too old, we fall back to using block data
        bytes32 blockHash = blockhash(fold.strategyBlock);

        // If blockhash is 0 (block too old or same block), use a fallback
        if (blockHash == bytes32(0)) {
            blockHash = blockhash(block.number - 1);
        }

        // Combine blockhash with token-specific data for uniqueness
        return keccak256(abi.encodePacked(
            blockHash,
            foldId,
            tokenId,
            fold.startTime
        ));
    }
}
