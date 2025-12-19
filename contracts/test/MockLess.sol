// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockLess
/// @notice Mock of the Less NFT contract for testing LessRenderer on testnets
/// @dev Simulates the mint window pattern with exponential pricing
contract MockLess {
    struct Window {
        uint64 startTime;
        uint64 endTime;
        bytes32 blockHash;
    }

    struct TokenData {
        uint64 windowId;
        bytes32 seed;
    }

    address public owner;
    address public renderer;

    uint256 public windowCount;
    uint256 public totalSupply;
    uint256 public windowDuration = 90 minutes; // Default 90 minute windows
    uint256 public mintPrice = 0.001 ether; // Base mint price

    mapping(uint256 => Window) public windows;
    mapping(uint256 => TokenData) public tokenData;
    mapping(uint256 => address) private _owners;
    mapping(uint256 => mapping(address => uint256)) public mintCountPerWindow;

    event WindowCreated(uint256 indexed windowId, uint64 startTime, uint64 endTime, bytes32 blockHash);
    event WindowClosed(uint256 indexed windowId);
    event Minted(uint256 indexed tokenId, uint256 indexed windowId, address indexed minter, bytes32 seed);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    error NoActiveMintWindow();
    error InvalidQuantity();
    error IncorrectPayment();
    error MintWindowActive();
    error TokenDoesNotExist();
    error WindowDoesNotExist();

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ============ Window Management ============

    /// @notice Open a new mint window
    /// @dev Creates a new window with the current block hash as entropy
    function createWindow() external onlyOwner {
        if (_isWindowActive()) revert MintWindowActive();

        windowCount++;

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(windowDuration);
        bytes32 blockHash = blockhash(block.number - 1);

        windows[windowCount] = Window({
            startTime: startTime,
            endTime: endTime,
            blockHash: blockHash
        });

        emit WindowCreated(windowCount, startTime, endTime, blockHash);
    }

    /// @notice Open a window with a custom block hash (for testing specific seeds)
    function createWindowWithHash(bytes32 _blockHash) external onlyOwner {
        if (_isWindowActive()) revert MintWindowActive();

        windowCount++;

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(windowDuration);

        windows[windowCount] = Window({
            startTime: startTime,
            endTime: endTime,
            blockHash: _blockHash
        });

        emit WindowCreated(windowCount, startTime, endTime, _blockHash);
    }

    /// @notice Close the current window early
    function closeWindow() external onlyOwner {
        if (windowCount == 0) revert WindowDoesNotExist();

        // Set endTime to now to close the window
        windows[windowCount].endTime = uint64(block.timestamp);

        emit WindowClosed(windowCount);
    }

    /// @notice Set the window duration for new windows
    function setWindowDuration(uint256 _duration) external onlyOwner {
        windowDuration = _duration;
    }

    /// @notice Set the base mint price
    function setMintPrice(uint256 _mintPrice) external onlyOwner {
        mintPrice = _mintPrice;
    }

    // ============ Minting ============

    /// @notice Mint tokens during an active window with exponential pricing
    /// @param quantity Number of tokens to mint
    function mint(uint256 quantity) external payable {
        if (quantity == 0) revert InvalidQuantity();
        if (!_isWindowActive()) revert NoActiveMintWindow();

        uint256 windowId = windowCount;
        uint256 previousMints = mintCountPerWindow[windowId][msg.sender];

        // Calculate total cost with exponential pricing
        uint256 totalCost = _calculateMintCost(previousMints, quantity);

        if (msg.value != totalCost) revert IncorrectPayment();

        // Update mint count
        mintCountPerWindow[windowId][msg.sender] = previousMints + quantity;

        // Mint tokens
        uint256 startTokenId = totalSupply + 1;
        totalSupply += quantity;
        bytes32 blockHash = windows[windowId].blockHash;

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = startTokenId + i;
            bytes32 seed = keccak256(abi.encodePacked(blockHash, tokenId));
            tokenData[tokenId] = TokenData({windowId: uint64(windowId), seed: seed});
            _owners[tokenId] = msg.sender;

            emit Transfer(address(0), msg.sender, tokenId);
            emit Minted(tokenId, windowId, msg.sender, seed);
        }
        // ETH accumulates in contract; owner withdraws via withdraw()
    }

    /// @notice Mint to a specific address (owner only, for testing)
    function mintTo(address to, uint256 quantity) external onlyOwner {
        if (quantity == 0) revert InvalidQuantity();
        if (!_isWindowActive()) revert NoActiveMintWindow();

        uint256 windowId = windowCount;

        uint256 startTokenId = totalSupply + 1;
        totalSupply += quantity;
        bytes32 blockHash = windows[windowId].blockHash;

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = startTokenId + i;
            bytes32 seed = keccak256(abi.encodePacked(blockHash, tokenId));
            tokenData[tokenId] = TokenData({windowId: uint64(windowId), seed: seed});
            _owners[tokenId] = to;

            emit Transfer(address(0), to, tokenId);
            emit Minted(tokenId, windowId, to, seed);
        }
    }

    // ============ View Functions (ILess interface for LessRenderer) ============

    function getSeed(uint256 tokenId) external view returns (bytes32) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return tokenData[tokenId].seed;
    }

    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return tokenData[tokenId];
    }

    function getWindow(uint256 windowId) external view returns (Window memory) {
        if (windowId == 0 || windowId > windowCount) revert WindowDoesNotExist();
        return windows[windowId];
    }

    function strategy() external pure returns (address) {
        return address(0);
    }

    function isWindowActive() external view returns (bool) {
        return _isWindowActive();
    }

    function activeWindowId() external view returns (uint256) {
        if (_isWindowActive()) {
            return windowCount;
        }
        return 0;
    }

    function timeUntilWindowCloses() external view returns (uint256) {
        if (!_isWindowActive()) return 0;
        Window storage window = windows[windowCount];
        if (block.timestamp >= window.endTime) return 0;
        return window.endTime - block.timestamp;
    }

    function canCreateWindow() external view returns (bool) {
        // On testnet, just check if no active window
        return !_isWindowActive();
    }

    /// @notice Get the number of mints a user has made in the current window
    function getMintCount(address user) external view returns (uint256) {
        if (windowCount == 0) return 0;
        return mintCountPerWindow[windowCount][user];
    }

    /// @notice Get the price for a user's next single mint in the current window
    function getNextMintPrice(address user) external view returns (uint256) {
        uint256 previousMints = windowCount > 0
            ? mintCountPerWindow[windowCount][user]
            : 0;
        return _calculateMintCost(previousMints, 1);
    }

    /// @notice Get the total cost for a user to mint a specific quantity
    function getMintCost(address user, uint256 quantity) external view returns (uint256) {
        if (quantity == 0) return 0;
        uint256 previousMints = windowCount > 0
            ? mintCountPerWindow[windowCount][user]
            : 0;
        return _calculateMintCost(previousMints, quantity);
    }

    /// @notice Get the price multiplier for a user's next mint (scaled by 1e18)
    function getPriceMultiplier(address user) external view returns (uint256) {
        uint256 previousMints = windowCount > 0
            ? mintCountPerWindow[windowCount][user]
            : 0;
        // 1.5^n = 3^n / 2^n, scaled by 1e18
        return (1e18 * (3 ** previousMints)) / (2 ** previousMints);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist();
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        if (renderer == address(0)) return "";

        // Delegate to renderer
        (bool success, bytes memory data) = renderer.staticcall(
            abi.encodeWithSignature("tokenURI(uint256)", tokenId)
        );
        if (success && data.length > 0) {
            return abi.decode(data, (string));
        }
        return "";
    }

    // ============ Admin ============

    function setRenderer(address _renderer) external onlyOwner {
        renderer = _renderer;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Withdraw ETH from the contract (for testing)
    function withdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    // ============ Internal ============

    function _isWindowActive() internal view returns (bool) {
        if (windowCount == 0) return false;
        Window storage window = windows[windowCount];
        return block.timestamp >= window.startTime && block.timestamp < window.endTime;
    }

    /// @notice Calculate the total cost for minting with exponential pricing
    /// @dev Uses integer math: 1.5 = 3/2, so 1.5^n = 3^n / 2^n
    function _calculateMintCost(
        uint256 previousMints,
        uint256 quantity
    ) internal view returns (uint256) {
        // Special case: quantity = 1
        if (quantity == 1) {
            return (mintPrice * (3 ** previousMints)) / (2 ** previousMints);
        }

        // General case: sum of geometric series
        uint256 pow3Prev = 3 ** previousMints;
        uint256 pow3Qty = 3 ** quantity;
        uint256 pow2Qty = 2 ** quantity;
        uint256 pow2Denom = 2 ** (previousMints + quantity - 1);

        return (mintPrice * pow3Prev * (pow3Qty - pow2Qty)) / pow2Denom;
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
