// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockLess
/// @notice Mock of the Less NFT contract for testing LessRenderer on testnets
/// @dev Simulates the fold/mint window pattern of the real Less contract
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
    address public renderer;

    uint256 public currentFoldId;
    uint256 public totalSupply;
    uint256 public windowDuration = 1 hours; // Default 1 hour windows

    mapping(uint256 => Fold) public folds;
    mapping(uint256 => TokenData) public tokenData;
    mapping(uint256 => address) private _owners;
    mapping(uint256 => bytes32) private _seeds; // Cache computed seeds
    mapping(uint256 => mapping(address => bool)) public hasMintedFold;

    event FoldCreated(uint256 indexed foldId, uint64 startTime, uint64 endTime, bytes32 blockHash);
    event FoldClosed(uint256 indexed foldId);
    event Minted(uint256 indexed tokenId, uint256 indexed foldId, address indexed minter, bytes32 seed);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    error NoActiveMintWindow();
    error AlreadyMintedThisFold();
    error MintWindowActive();
    error TokenDoesNotExist();
    error FoldDoesNotExist();

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ============ Fold Management ============

    /// @notice Open a new fold/mint window
    /// @dev Creates a new fold with the current block hash as entropy
    function openFold() external onlyOwner {
        if (_isWindowActive()) revert MintWindowActive();

        currentFoldId++;

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(windowDuration);
        bytes32 blockHash = blockhash(block.number - 1);

        folds[currentFoldId] = Fold({
            startTime: startTime,
            endTime: endTime,
            blockHash: blockHash
        });

        emit FoldCreated(currentFoldId, startTime, endTime, blockHash);
    }

    /// @notice Open a fold with a custom block hash (for testing specific seeds)
    function openFoldWithHash(bytes32 _blockHash) external onlyOwner {
        if (_isWindowActive()) revert MintWindowActive();

        currentFoldId++;

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + uint64(windowDuration);

        folds[currentFoldId] = Fold({
            startTime: startTime,
            endTime: endTime,
            blockHash: _blockHash
        });

        emit FoldCreated(currentFoldId, startTime, endTime, _blockHash);
    }

    /// @notice Close the current fold early
    function closeFold() external onlyOwner {
        if (currentFoldId == 0) revert FoldDoesNotExist();

        // Set endTime to now to close the window
        folds[currentFoldId].endTime = uint64(block.timestamp);

        emit FoldClosed(currentFoldId);
    }

    /// @notice Set the window duration for new folds
    function setWindowDuration(uint256 _duration) external onlyOwner {
        windowDuration = _duration;
    }

    // ============ Minting ============

    /// @notice Mint a token during an active fold window
    function mint() external {
        if (!_isWindowActive()) revert NoActiveMintWindow();

        uint256 foldId = currentFoldId;

        if (hasMintedFold[foldId][msg.sender]) revert AlreadyMintedThisFold();

        hasMintedFold[foldId][msg.sender] = true;

        uint256 tokenId = ++totalSupply;

        tokenData[tokenId] = TokenData({foldId: uint64(foldId)});
        _owners[tokenId] = msg.sender;

        // Compute and cache the seed
        bytes32 seed = keccak256(abi.encodePacked(folds[foldId].blockHash, tokenId));
        _seeds[tokenId] = seed;

        emit Transfer(address(0), msg.sender, tokenId);
        emit Minted(tokenId, foldId, msg.sender, seed);
    }

    /// @notice Mint to a specific address (owner only, for testing)
    function mintTo(address to) external onlyOwner {
        if (!_isWindowActive()) revert NoActiveMintWindow();

        uint256 foldId = currentFoldId;
        uint256 tokenId = ++totalSupply;

        tokenData[tokenId] = TokenData({foldId: uint64(foldId)});
        _owners[tokenId] = to;

        bytes32 seed = keccak256(abi.encodePacked(folds[foldId].blockHash, tokenId));
        _seeds[tokenId] = seed;

        emit Transfer(address(0), to, tokenId);
        emit Minted(tokenId, foldId, to, seed);
    }

    // ============ View Functions (ILess interface for LessRenderer) ============

    function getSeed(uint256 tokenId) external view returns (bytes32) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();

        // Return cached seed or compute it
        if (_seeds[tokenId] != bytes32(0)) {
            return _seeds[tokenId];
        }

        uint256 foldId = tokenData[tokenId].foldId;
        return keccak256(abi.encodePacked(folds[foldId].blockHash, tokenId));
    }

    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return tokenData[tokenId];
    }

    function getFold(uint256 foldId) external view returns (Fold memory) {
        if (foldId == 0 || foldId > currentFoldId) revert FoldDoesNotExist();
        return folds[foldId];
    }

    function strategy() external pure returns (address) {
        return address(0);
    }

    function isWindowActive() external view returns (bool) {
        return _isWindowActive();
    }

    function activeFoldId() external view returns (uint256) {
        if (_isWindowActive()) {
            return currentFoldId;
        }
        return 0;
    }

    function timeUntilWindowCloses() external view returns (uint256) {
        if (!_isWindowActive()) return 0;
        Fold storage fold = folds[currentFoldId];
        if (block.timestamp >= fold.endTime) return 0;
        return fold.endTime - block.timestamp;
    }

    function canCreateFold() external view returns (bool) {
        // On testnet, just check if no active window
        return !_isWindowActive();
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

    // ============ Internal ============

    function _isWindowActive() internal view returns (bool) {
        if (currentFoldId == 0) return false;
        Fold storage fold = folds[currentFoldId];
        return block.timestamp >= fold.startTime && block.timestamp < fold.endTime;
    }
}
