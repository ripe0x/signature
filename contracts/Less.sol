// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "solady/tokens/ERC721.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {IRecursiveStrategy} from "./IRecursiveStrategy.sol";
import {ILessRenderer} from "./ILessRenderer.sol";

/// @title Less
/// @author less.art
/// @notice ERC721 collection tied to RecursiveStrategy burn events
/// @dev Each fold event opens a time-limited mint window; one mint per address per fold.
///      The contract integrates with RecursiveStrategy to trigger token burns, and each
///      burn event creates a new "fold" - a time-limited window during which users can mint.
///      Each address can only mint once per fold, creating scarcity tied to burn frequency.
contract Less is ERC721, Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Data for each fold event / mint window
    /// @dev Stored when createFold() is called, immutable after creation
    /// @param startTime Unix timestamp when the mint window opens
    /// @param endTime Unix timestamp when the mint window closes
    /// @param blockHash Hash of the block before fold creation, used for seed generation
    struct Fold {
        uint64 startTime;
        uint64 endTime;
        bytes32 blockHash;
    }

    /// @notice Per-token data stored on mint
    /// @dev Immutable after minting
    /// @param foldId Which fold this token belongs to (1-indexed)
    struct TokenData {
        uint64 foldId;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new fold is created via createFold()
    /// @param foldId The unique identifier for this fold (1-indexed)
    /// @param startTime Unix timestamp when minting opens
    /// @param endTime Unix timestamp when minting closes
    /// @param blockHash Hash of the previous block, used for seed entropy
    event FoldCreated(
        uint256 indexed foldId,
        uint64 startTime,
        uint64 endTime,
        bytes32 blockHash
    );

    /// @notice Emitted when a token is minted
    /// @param tokenId The newly minted token's ID
    /// @param foldId The fold during which this token was minted
    /// @param minter Address that minted the token
    /// @param seed The deterministic seed assigned to this token
    event Minted(
        uint256 indexed tokenId,
        uint256 indexed foldId,
        address indexed minter,
        bytes32 seed
    );

    /// @notice Emitted when the mint price is updated by the owner
    /// @param newPrice The new mint price in wei
    event MintPriceUpdated(uint256 newPrice);

    /// @notice Emitted when the payout recipient is updated by the owner
    /// @param newRecipient The new address that will receive mint payments
    event PayoutRecipientUpdated(address newRecipient);

    /// @notice Emitted when the renderer contract is updated by the owner
    /// @param newRenderer The new renderer contract address
    event RendererUpdated(address newRenderer);

    /// @notice Emitted when the minimum ETH threshold for fold creation is updated
    /// @param newMinEth The new minimum ETH balance required in the strategy
    event MinEthForFoldUpdated(uint256 newMinEth);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when attempting to create a fold while a mint window is still active
    error MintWindowActive();

    /// @notice Thrown when attempting to mint outside of an active mint window
    error NoActiveMintWindow();

    /// @notice Thrown when an address attempts to mint more than once per fold
    error AlreadyMintedThisFold();

    /// @notice Thrown when msg.value is less than the required mint price
    error InsufficientPayment();

    /// @notice Thrown when setting payout recipient to the zero address
    error InvalidPayoutRecipient();

    /// @notice Thrown when strategy ETH balance is below minEthForFold threshold
    error InsufficientStrategyBalance();

    /// @notice Thrown when deploying with a zero address strategy
    error InvalidStrategyAddress();

    /// @notice Thrown when deploying with a zero address owner
    error InvalidOwner();

    /// @notice Thrown when setting renderer to the zero address
    error InvalidRenderer();

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

    /// @notice Minimum ETH balance required in strategy contract to create a fold
    uint256 public minEthForFold;

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
        if (_strategy == address(0)) revert InvalidStrategyAddress();
        if (_payoutRecipient == address(0)) revert InvalidPayoutRecipient();
        if (_owner == address(0)) revert InvalidOwner();

        strategy = IRecursiveStrategy(_strategy);
        windowDuration = IRecursiveStrategy(_strategy).timeBetweenBurn();
        mintPrice = _mintPrice;
        payoutRecipient = _payoutRecipient;
        minEthForFold = 0.25 ether;

        _initializeOwner(_owner);
    }

    /*//////////////////////////////////////////////////////////////
                            ERC721 METADATA
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the collection name
    /// @return The name "LESS"
    function name() public pure override returns (string memory) {
        return "LESS";
    }

    /// @notice Returns the collection symbol
    /// @return The symbol "LESS"
    function symbol() public pure override returns (string memory) {
        return "LESS";
    }

    /// @notice Returns the token URI by delegating to the renderer
    /// @dev Reverts if the token does not exist or if renderer is not set
    /// @param tokenId The token to get metadata for
    /// @return A data URI containing base64-encoded JSON metadata
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return ILessRenderer(renderer).tokenURI(tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                           FOLD MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates a new fold by triggering a burn on the strategy
    /// @dev Anyone can call this; will revert if a mint window is active, strategy balance is insufficient, or strategy burn fails.
    ///      Note: mint() will automatically create a fold if needed, so this function is optional.
    function createFold() external nonReentrant {
        if (_isWindowActive()) revert MintWindowActive();
        _createFold();
    }

    /// @notice Internal function to create a new fold
    /// @dev Checks balance, triggers strategy burn, and records fold data
    function _createFold() internal {
        // Check strategy has minimum ETH balance required
        if (address(strategy).balance < minEthForFold)
            revert InsufficientStrategyBalance();

        // Capture previous block's hash for seed entropy
        // (can't get current block's hash, so use block.number - 1)
        bytes32 blockHash = blockhash(block.number - 1);

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
            blockHash: blockHash
        });

        emit FoldCreated(currentFoldId, startTime, endTime, blockHash);
    }

    /// @notice Check if there is currently an active mint window
    /// @return True if a mint window is currently open, false otherwise
    function isWindowActive() external view returns (bool) {
        return _isWindowActive();
    }

    /// @notice Get the current active fold ID
    /// @return The active fold ID, or 0 if no mint window is currently active
    function activeFoldId() external view returns (uint256) {
        if (_isWindowActive()) {
            return currentFoldId;
        }
        return 0;
    }

    /// @notice Check if a fold can be created
    /// @dev Returns true only if: no active window, strategy balance >= minEthForFold, and TWAP delay met
    /// @return True if createFold() would succeed, false otherwise
    function canCreateFold() external view returns (bool) {
        if (_isWindowActive()) return false;
        if (address(strategy).balance < minEthForFold) return false;
        return strategy.timeUntilFundsMoved() == 0;
    }

    /// @notice Get the time remaining in the current mint window
    /// @return Seconds until the window closes, or 0 if no window is active
    function timeUntilWindowCloses() external view returns (uint256) {
        if (!_isWindowActive()) return 0;
        return folds[currentFoldId].endTime - block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                              MINTING
    //////////////////////////////////////////////////////////////*/

    /// @notice Mint a token for the current active fold
    /// @dev One mint per address per fold; requires payment >= mintPrice (excess refunded).
    ///      If no window is active but one can be created, automatically creates a new fold.
    function mint() external payable nonReentrant {
        // If no active window, try to create a new fold
        if (!_isWindowActive()) {
            _createFold();
        }

        uint256 foldId = currentFoldId;

        // Check not already minted this fold
        if (hasMintedFold[foldId][msg.sender]) revert AlreadyMintedThisFold();

        // Check payment
        if (msg.value < mintPrice) revert InsufficientPayment();

        // Calculate refund if overpaid
        uint256 refundAmount = msg.value - mintPrice;

        // Mark as minted for this fold
        hasMintedFold[foldId][msg.sender] = true;

        // Generate token ID and increment supply
        uint256 tokenId = ++totalSupply;

        // Store token data (seed is computed on-demand via getSeed)
        tokenData[tokenId] = TokenData({foldId: uint64(foldId)});

        // Mint the token
        _mint(msg.sender, tokenId);

        // Forward payment to payout recipient
        SafeTransferLib.forceSafeTransferETH(payoutRecipient, mintPrice);

        // Refund excess payment if any
        if (refundAmount > 0) {
            SafeTransferLib.forceSafeTransferETH(msg.sender, refundAmount);
        }

        // Compute seed for event emission
        bytes32 seed = _computeSeed(foldId, tokenId);
        emit Minted(tokenId, foldId, msg.sender, seed);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the fold ID for a token
    /// @param tokenId The token ID to query
    /// @return The fold ID during which this token was minted
    function getFoldId(uint256 tokenId) external view returns (uint256) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return tokenData[tokenId].foldId;
    }

    /// @notice Get the seed for a token
    /// @dev Seed is computed on-demand from the fold's blockHash and tokenId
    /// @param tokenId The token ID to query
    /// @return The deterministic seed used for this token's generative art
    function getSeed(uint256 tokenId) external view returns (bytes32) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        uint256 foldId = tokenData[tokenId].foldId;
        return _computeSeed(foldId, tokenId);
    }

    /// @notice Get full fold data
    /// @dev Returns an empty struct if the fold ID doesn't exist
    /// @param foldId The fold ID to query
    /// @return The Fold struct containing startTime, endTime, and blockHash
    function getFold(uint256 foldId) external view returns (Fold memory) {
        return folds[foldId];
    }

    /// @notice Get full token data
    /// @param tokenId The token ID to query
    /// @return The TokenData struct containing foldId
    function getTokenData(
        uint256 tokenId
    ) external view returns (TokenData memory) {
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
        if (_renderer == address(0)) revert InvalidRenderer();
        renderer = _renderer;
        emit RendererUpdated(_renderer);
    }

    /// @notice Update the minimum ETH balance required to create a fold
    /// @param _minEthForFold New minimum ETH amount in wei
    function setMinEthForFold(uint256 _minEthForFold) external onlyOwner {
        minEthForFold = _minEthForFold;
        emit MinEthForFoldUpdated(_minEthForFold);
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if there is an active mint window
    /// @dev Window is active when currentFoldId > 0 and current time is within [startTime, endTime)
    /// @return True if minting is currently allowed, false otherwise
    function _isWindowActive() internal view returns (bool) {
        if (currentFoldId == 0) return false;
        Fold storage fold = folds[currentFoldId];
        return
            block.timestamp >= fold.startTime && block.timestamp < fold.endTime;
    }

    /// @notice Compute a deterministic seed for a token
    /// @dev Combines the fold's stored blockHash with the tokenId
    /// @param foldId The fold this token belongs to
    /// @param tokenId The token ID
    /// @return A unique bytes32 seed for use in generative art rendering
    function _computeSeed(
        uint256 foldId,
        uint256 tokenId
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(folds[foldId].blockHash, tokenId));
    }
}
