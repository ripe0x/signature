// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "solady/tokens/ERC721.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {IRecursiveStrategy} from "./IRecursiveStrategy.sol";
import {ILessRenderer} from "./ILessRenderer.sol";

/// @title Less
/// @author ripe
/// @notice ERC721 collection tied to RecursiveStrategy burn events
/// @dev Each burn event opens a time-limited mint window. The contract integrates with
///      RecursiveStrategy to trigger token burns, and each burn creates a new window
///      during which users can mint. Scarcity is tied to burn frequency.
contract Less is ERC721, Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Data for each mint window
    /// @dev Stored when createWindow() is called, immutable after creation
    /// @param endTime Unix timestamp when the mint window closes
    struct Window {
        uint64 endTime;
    }

    /// @notice Per-token data stored on mint
    /// @dev Immutable after minting
    /// @param windowId Which window this token belongs to (1-indexed)
    /// @param seed Deterministic seed for generative art, derived from mint block hash
    struct TokenData {
        uint64 windowId;
        bytes32 seed;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new window is created via createWindow()
    /// @param windowId The unique identifier for this window (1-indexed)
    /// @param startTime Unix timestamp when minting opens
    /// @param endTime Unix timestamp when minting closes
    event WindowCreated(
        uint256 indexed windowId,
        uint64 startTime,
        uint64 endTime
    );

    /// @notice Emitted when a token is minted
    /// @param tokenId The newly minted token's ID
    /// @param windowId The window during which this token was minted
    /// @param minter Address that minted the token
    /// @param seed The deterministic seed assigned to this token
    event Minted(
        uint256 indexed tokenId,
        uint256 indexed windowId,
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

    /// @notice Emitted when the minimum ETH threshold for window creation is updated
    /// @param newMinEth The new minimum ETH balance required in the strategy
    event MinEthForWindowUpdated(uint256 newMinEth);

    /// @notice Emitted when the strategy contract is updated by the owner
    /// @param newStrategy The new strategy contract address
    event StrategyUpdated(address newStrategy);

    /// @notice Emitted when the mint window duration is updated
    /// @param newWindowDuration The new window duration in seconds
    event WindowDurationUpdated(uint256 newWindowDuration);

    /// @notice Emitted when ETH is withdrawn from the contract
    /// @param recipient The address that received the funds
    /// @param amount The amount of ETH withdrawn
    event Withdrawn(address indexed recipient, uint256 amount);

    /// @notice Emitted when minting is paused or unpaused
    /// @param paused True if minting is now paused, false if unpaused
    event MintingPausedChanged(bool paused);

    /// @notice Emitted when window creation is enabled or disabled
    /// @param enabled True if window creation is now enabled, false if disabled
    event WindowCreationEnabledChanged(bool enabled);

    /// @notice Emitted when window 0 (pre-launch mint) is started
    /// @param startTime Unix timestamp when window 0 opens
    /// @param endTime Unix timestamp when window 0 closes
    event Window0Started(uint64 startTime, uint64 endTime);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when attempting to create a window while one is still active
    error MintWindowActive();

    /// @notice Thrown when quantity is zero
    error InvalidQuantity();

    /// @notice Thrown when msg.value doesn't match the required mint price
    error IncorrectPayment();

    /// @notice Thrown when an address parameter is invalid (zero address)
    error InvalidAddress();

    /// @notice Thrown when strategy ETH balance is below minEthForWindow threshold
    error InsufficientStrategyBalance();

    /// @notice Thrown when minting is paused
    error MintingPaused();

    /// @notice Thrown when window creation is disabled
    error WindowCreationDisabled();

    /// @notice Thrown when trying to start window 0 after windows have begun or window 0 already started
    error Window0NotAllowed();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Reference to the RecursiveStrategy token
    IRecursiveStrategy public strategy;

    /// @notice Duration of each mint window in seconds
    uint256 public windowDuration;

    /// @notice Total number of windows created
    uint256 public windowCount;

    /// @notice Total number of tokens minted
    uint256 public totalSupply;

    /// @notice Price in wei to mint one token
    uint256 public mintPrice;

    /// @notice Recipient of mint payments
    address public payoutRecipient;

    /// @notice External renderer contract for tokenURI
    address public renderer;

    /// @notice Minimum ETH balance required in strategy contract to create a window
    uint256 public minEthForWindow;

    /// @notice Whether minting is currently paused
    bool public mintingPaused;

    /// @notice Whether window creation is currently enabled
    bool public windowCreationEnabled;

    /// @notice End time for window 0 (pre-launch mint window), 0 if not started
    uint64 public window0EndTime;

    /// @notice Mapping of window ID to window data
    mapping(uint256 => Window) internal _windows;

    /// @notice Mapping of token ID to token data
    mapping(uint256 => TokenData) internal _tokenData;

    /// @notice Tracks how many times each address has minted for each window
    /// @dev windowId => minter => mintCount
    mapping(uint256 => mapping(address => uint256))
        internal _mintCountPerWindow;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the Less NFT contract
    /// @dev Sets immutable strategy reference and configurable windowDuration
    /// @param _strategy Address of the RecursiveStrategy token
    /// @param _mintPrice Initial mint price in wei
    /// @param _payoutRecipient Initial recipient for mint payments
    /// @param _owner Contract owner
    /// @param _windowDuration Duration of each mint window in seconds
    constructor(
        address _strategy,
        uint256 _mintPrice,
        address _payoutRecipient,
        address _owner,
        uint256 _windowDuration
    ) {
        if (_payoutRecipient == address(0)) revert InvalidAddress();
        if (_owner == address(0)) revert InvalidAddress();

        // Strategy can be zero address initially and set later via setStrategy()
        strategy = IRecursiveStrategy(_strategy);
        windowDuration = _windowDuration;
        mintPrice = _mintPrice;
        payoutRecipient = _payoutRecipient;
        minEthForWindow = 0.25 ether;

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

    /// @notice Returns the collection-level metadata URI
    /// @dev Delegates to the renderer contract
    /// @return A data URI containing base64-encoded JSON collection metadata
    function contractURI() external view returns (string memory) {
        return ILessRenderer(renderer).contractURI();
    }

    /*//////////////////////////////////////////////////////////////
                           WINDOW MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates a new window by triggering a burn on the strategy
    /// @dev Anyone can call this; will revert if a mint window is active, window creation is disabled, strategy balance is insufficient, or strategy burn fails.
    ///      Note: mint() will automatically create a window if needed, so this function is optional.
    ///      After window 0 ends, window creation is automatically enabled.
    function createWindow() external nonReentrant {
        // Auto-enable window creation after window 0 ends
        bool autoEnabled = windowCount == 0 &&
            window0EndTime > 0 &&
            block.timestamp >= window0EndTime;
        if (!windowCreationEnabled && !autoEnabled)
            revert WindowCreationDisabled();
        if (_isWindowActive()) revert MintWindowActive();
        _createWindow();
    }

    /// @notice Internal function to create a new window
    /// @dev Checks balance, triggers strategy burn, and records window data.
    ///      When transitioning from window 0, permanently enables window creation.
    function _createWindow() internal {
        // Auto-enable window creation permanently after window 0 ends
        if (!windowCreationEnabled && windowCount == 0 && window0EndTime > 0) {
            windowCreationEnabled = true;
            emit WindowCreationEnabledChanged(true);
        }

        // Check strategy has minimum ETH balance required
        if (address(strategy).balance < minEthForWindow)
            revert InsufficientStrategyBalance();

        // Trigger the burn on the strategy
        // This will revert if:
        // - No ETH available for TWAP (NoETHToTwap)
        // - Not enough blocks since last TWAP (TwapDelayNotMet)
        // The strategy team will configure the strategy so only this contract
        // can call processTokenTwap (via distributor whitelist or similar)
        strategy.processTokenTwap();

        // Increment window ID (starts at 1)
        windowCount++;

        // Record window data
        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(windowDuration);

        _windows[windowCount] = Window({endTime: endTime});

        emit WindowCreated(windowCount, startTime, endTime);
    }

    /// @notice Check if there is currently an active mint window
    /// @return True if a mint window is currently open, false otherwise
    function isWindowActive() external view returns (bool) {
        return _isWindowActive();
    }

    /// @notice Check if a window can be created
    /// @dev Returns true only if: window creation enabled (or window 0 ended), no active window, strategy balance >= minEthForWindow, and TWAP delay met.
    ///      Note: This view function mirrors the conditions that would cause _createWindow() to revert.
    ///      If the strategy's processTokenTwap() revert conditions ever diverge from timeUntilFundsMoved(),
    ///      this function could return true when createWindow() would actually fail.
    /// @return True if createWindow() would likely succeed, false otherwise
    function canCreateWindow() external view returns (bool) {
        // Check if window creation is allowed (explicitly enabled or auto-enabled after window 0)
        bool autoEnabled = windowCount == 0 &&
            window0EndTime > 0 &&
            block.timestamp >= window0EndTime;
        if (!windowCreationEnabled && !autoEnabled) return false;
        if (_isWindowActive()) return false;
        if (address(strategy).balance < minEthForWindow) return false;
        return strategy.timeUntilFundsMoved() == 0;
    }

    /// @notice Get the time remaining in the current mint window
    /// @return Seconds until the window closes, or 0 if no window is active
    function timeUntilWindowCloses() external view returns (uint256) {
        if (!_isWindowActive()) return 0;
        // Handle window 0
        if (windowCount == 0) {
            return window0EndTime - block.timestamp;
        }
        return _windows[windowCount].endTime - block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                              MINTING
    //////////////////////////////////////////////////////////////*/

    /// @notice Mint tokens for the current active window with exponential pricing
    /// @dev Price escalates per wallet per window: price(n) = mintPrice * 1.5^(n-1)
    ///      where n is the nth mint for this wallet in this window.
    ///      If no window is active but one can be created, automatically creates a new window.
    ///      After window 0 ends, window creation is automatically enabled.
    /// @param quantity Number of tokens to mint (must be >= 1)
    function mint(uint256 quantity) external payable nonReentrant {
        if (mintingPaused) revert MintingPaused();
        if (quantity == 0) revert InvalidQuantity();

        // If no active window, try to create a new one
        if (!_isWindowActive()) {
            // Auto-enable window creation after window 0 ends
            bool autoEnabled = windowCount == 0 &&
                window0EndTime > 0 &&
                block.timestamp >= window0EndTime;
            if (!windowCreationEnabled && !autoEnabled)
                revert WindowCreationDisabled();
            _createWindow();
        }

        uint256 windowId = windowCount;
        uint256 previousMints = _mintCountPerWindow[windowId][msg.sender];

        // Calculate total cost with exponential pricing
        uint256 totalCost = _calculateMintCost(previousMints, quantity);

        // Check payment (exact amount required)
        if (msg.value != totalCost) revert IncorrectPayment();

        // Update mint count for this window
        _mintCountPerWindow[windowId][msg.sender] = previousMints + quantity;

        // Mint tokens - seed derived from mint block hash for unpredictability
        uint256 startTokenId = totalSupply + 1;
        totalSupply += quantity;
        bytes32 blockHash = blockhash(block.number - 1);

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = startTokenId + i;
            bytes32 seed = keccak256(abi.encodePacked(blockHash, tokenId));
            _tokenData[tokenId] = TokenData({
                windowId: uint64(windowId),
                seed: seed
            });
            _mint(msg.sender, tokenId);

            emit Minted(tokenId, windowId, msg.sender, seed);
        }
        // ETH accumulates in contract; owner withdraws via withdraw()
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the seed for a token
    /// @param tokenId The token ID to query
    /// @return The deterministic seed used for this token's generative art
    function getSeed(uint256 tokenId) external view returns (bytes32) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return _tokenData[tokenId].seed;
    }

    /// @notice Get full token data
    /// @param tokenId The token ID to query
    /// @return The TokenData struct containing windowId and seed
    function getTokenData(
        uint256 tokenId
    ) external view returns (TokenData memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        return _tokenData[tokenId];
    }

    /// @notice Get the number of mints a user has made in the current window
    /// @param user The address to check
    /// @return The number of mints for this user in the current window (0 if no active window)
    function getMintCount(address user) external view returns (uint256) {
        // During window 0, return mints for window 0
        if (windowCount == 0) {
            if (window0EndTime == 0) return 0;
            return _mintCountPerWindow[0][user];
        }
        return _mintCountPerWindow[windowCount][user];
    }

    /// @notice Get the total cost for a user to mint a specific quantity
    /// @dev Calculates the sum of exponentially escalating prices
    /// @param user The address to check
    /// @param quantity The number of tokens to mint
    /// @return The total cost in wei
    function getMintCost(
        address user,
        uint256 quantity
    ) external view returns (uint256) {
        if (quantity == 0) return 0;
        uint256 previousMints;
        if (windowCount > 0) {
            previousMints = _mintCountPerWindow[windowCount][user];
        } else if (window0EndTime > 0) {
            // During window 0
            previousMints = _mintCountPerWindow[0][user];
        }
        return _calculateMintCost(previousMints, quantity);
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
        if (_payoutRecipient == address(0)) revert InvalidAddress();
        payoutRecipient = _payoutRecipient;
        emit PayoutRecipientUpdated(_payoutRecipient);
    }

    /// @notice Update the renderer contract
    /// @param _renderer New renderer address
    function setRenderer(address _renderer) external onlyOwner {
        if (_renderer == address(0)) revert InvalidAddress();
        renderer = _renderer;
        emit RendererUpdated(_renderer);
    }

    /// @notice Update the minimum ETH balance required to create a window
    /// @param _minEthForWindow New minimum ETH amount in wei
    function setMinEthForWindow(uint256 _minEthForWindow) external onlyOwner {
        minEthForWindow = _minEthForWindow;
        emit MinEthForWindowUpdated(_minEthForWindow);
    }

    /// @notice Update the strategy contract
    /// @param _strategy New strategy address
    function setStrategy(address _strategy) external onlyOwner {
        if (_strategy == address(0)) revert InvalidAddress();
        strategy = IRecursiveStrategy(_strategy);
        emit StrategyUpdated(_strategy);
    }

    /// @notice Update the mint window duration
    /// @param _windowDuration New window duration in seconds
    function setWindowDuration(uint256 _windowDuration) external onlyOwner {
        windowDuration = _windowDuration;
        emit WindowDurationUpdated(_windowDuration);
    }

    /// @notice Pause or unpause minting
    /// @param _paused True to pause minting, false to unpause
    function setMintingPaused(bool _paused) external onlyOwner {
        mintingPaused = _paused;
        emit MintingPausedChanged(_paused);
    }

    /// @notice Enable or disable window creation
    /// @param _enabled True to enable window creation, false to disable
    function setWindowCreationEnabled(bool _enabled) external onlyOwner {
        windowCreationEnabled = _enabled;
        emit WindowCreationEnabledChanged(_enabled);
    }

    /// @notice Start window 0 (pre-launch mint window)
    /// @dev Can only be called once, before any regular windows are created.
    ///      Window 0 allows minting before the strategy integration begins.
    ///      After window 0 ends, window creation is automatically enabled.
    /// @param duration Duration of window 0 in seconds (e.g., 1800 for 30 minutes)
    function startWindow0(uint64 duration) external onlyOwner {
        if (windowCount > 0) revert Window0NotAllowed();
        if (window0EndTime > 0) revert Window0NotAllowed();

        uint64 startTime = uint64(block.timestamp);
        window0EndTime = startTime + duration;

        emit Window0Started(startTime, window0EndTime);
    }

    /// @notice Withdraw accumulated ETH to the payout recipient
    /// @dev Only callable by owner. Sends entire contract balance to payoutRecipient.
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        SafeTransferLib.forceSafeTransferETH(payoutRecipient, balance);
        emit Withdrawn(payoutRecipient, balance);
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if there is an active mint window
    /// @dev Window is active when:
    ///      1. Window 0 is active (windowCount == 0 && window0EndTime > 0 && block.timestamp < window0EndTime), OR
    ///      2. A regular window is active (windowCount > 0 && block.timestamp < endTime)
    ///      Note: At exactly endTime, window is inactive but a new window may not be
    ///      immediately creatable due to TWAP delay - this creates a brief limbo period.
    /// @return True if minting is currently allowed, false otherwise
    function _isWindowActive() internal view returns (bool) {
        // Check window 0 first
        if (windowCount == 0) {
            return window0EndTime > 0 && block.timestamp < window0EndTime;
        }
        return block.timestamp < _windows[windowCount].endTime;
    }

    /// @notice Calculate the total cost for minting with exponential pricing
    /// @dev Uses integer math: 1.5 = 3/2, so 1.5^n = 3^n / 2^n
    ///      For mints from (previousMints+1) to (previousMints+quantity):
    ///      Total = mintPrice * 3^previousMints * (3^quantity - 2^quantity) / 2^(previousMints + quantity - 1)
    ///      This is derived from the geometric series sum formula.
    /// @param previousMints Number of mints already made by this user in this window
    /// @param quantity Number of new mints
    /// @return Total cost in wei
    function _calculateMintCost(
        uint256 previousMints,
        uint256 quantity
    ) internal view returns (uint256) {
        // Special case: quantity = 1
        // price = mintPrice * 1.5^previousMints = mintPrice * 3^previousMints / 2^previousMints
        if (quantity == 1) {
            return (mintPrice * (3 ** previousMints)) / (2 ** previousMints);
        }

        // General case: sum of geometric series
        // Sum = mintPrice * 3^previousMints * (3^quantity - 2^quantity) / 2^(previousMints + quantity - 1)
        uint256 pow3Prev = 3 ** previousMints;
        uint256 pow3Qty = 3 ** quantity;
        uint256 pow2Qty = 2 ** quantity;
        uint256 pow2Denom = 2 ** (previousMints + quantity - 1);

        return (mintPrice * pow3Prev * (pow3Qty - pow2Qty)) / pow2Denom;
    }
}
