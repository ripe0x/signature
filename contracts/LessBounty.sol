// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "solady/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {ERC721} from "solady/tokens/ERC721.sol";

interface ILess {
    function mint(uint256 quantity) external payable;
    function getMintCost(address user, uint256 quantity) external view returns (uint256);
    function windowCount() external view returns (uint256);
    function isWindowActive() external view returns (bool);
    function totalSupply() external view returns (uint256);
}

/// @title LessBounty
/// @author ripe
/// @notice Individual bounty contract for automated LESS minting
/// @dev Created by LessBountyFactory as EIP-1167 clones. Pays a fixed reward to executors.
contract LessBounty is Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event ConfigUpdated(uint256 mintsPerWindow, uint256 executorReward);
    event BountyExecuted(address indexed executor, uint256 windowId, uint256 quantity, uint256 reward);
    event TargetWindowSet(uint256 indexed windowId, bool enabled);
    event Funded(address indexed funder, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event Paused(bool paused);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error NoActiveWindow();
    error WindowAlreadyMinted();
    error WindowNotTargeted();
    error InsufficientFunds();
    error NothingToWithdraw();
    error BountyPaused();
    error InvalidConfig();
    error CannotRescueLess();

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The LESS NFT contract
    ILess public immutable less;

    /// @notice Number of mints to execute per window
    uint256 public mintsPerWindow;

    /// @notice Fixed reward paid to executor per execution
    uint256 public executorReward;

    /// @notice Whether the bounty is paused
    bool public paused;

    /// @notice If true, only execute for windows in targetWindows mapping
    bool public specificWindowsOnly;

    /// @notice Tracks which windows have been minted
    mapping(uint256 => bool) public windowMinted;

    /// @notice Tracks which windows are targeted (when specificWindowsOnly is true)
    mapping(uint256 => bool) public targetWindows;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @dev Enable Solady's double-initialization guard
    function _guardInitializeOwner() internal pure virtual override returns (bool) {
        return true;
    }

    /// @notice Creates the implementation contract
    /// @param _less Address of the LESS NFT contract (shared by all clones)
    constructor(address _less) {
        less = ILess(_less);
        // Implementation contract should not be used directly
        _initializeOwner(address(0xdead));
    }

    /*//////////////////////////////////////////////////////////////
                            INITIALIZER
    //////////////////////////////////////////////////////////////*/

    /// @notice Initialize a clone with owner and optional config
    /// @param _owner Address of the bounty owner
    /// @param _mintsPerWindow Number of NFTs to mint per window (0 to skip config)
    /// @param _executorReward Fixed reward for executor (e.g., 0.001 ETH)
    function initialize(
        address _owner,
        uint256 _mintsPerWindow,
        uint256 _executorReward
    ) external {
        _initializeOwner(_owner);
        if (_mintsPerWindow > 0) {
            mintsPerWindow = _mintsPerWindow;
            executorReward = _executorReward;
            emit ConfigUpdated(_mintsPerWindow, _executorReward);
        }
    }

    /*//////////////////////////////////////////////////////////////
                            RECEIVE FUNCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Accept ETH deposits
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /*//////////////////////////////////////////////////////////////
                           OWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Configure the bounty parameters
    /// @param _mintsPerWindow Number of NFTs to mint per window (0 to disable)
    /// @param _executorReward Fixed reward for executor
    function configure(uint256 _mintsPerWindow, uint256 _executorReward) external onlyOwner {
        mintsPerWindow = _mintsPerWindow;
        executorReward = _executorReward;
        emit ConfigUpdated(_mintsPerWindow, _executorReward);
    }

    /// @notice Pause or unpause the bounty
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /// @notice Enable or disable specific windows mode
    function setSpecificWindowsOnly(bool _enabled) external onlyOwner {
        specificWindowsOnly = _enabled;
    }

    /// @notice Set a target window
    function setTargetWindow(uint256 windowId, bool enabled) external onlyOwner {
        targetWindows[windowId] = enabled;
        emit TargetWindowSet(windowId, enabled);
    }

    /// @notice Set multiple target windows at once
    function setTargetWindows(uint256[] calldata windowIds, bool enabled) external onlyOwner {
        for (uint256 i = 0; i < windowIds.length; i++) {
            targetWindows[windowIds[i]] = enabled;
            emit TargetWindowSet(windowIds[i], enabled);
        }
    }

    /// @notice Withdraw ETH from the contract
    /// @param amount Amount to withdraw (0 for all)
    function withdraw(uint256 amount) external onlyOwner {
        uint256 toWithdraw = amount == 0 ? address(this).balance : amount;
        if (toWithdraw == 0) revert NothingToWithdraw();
        SafeTransferLib.safeTransferETH(msg.sender, toWithdraw);
        emit Withdrawn(msg.sender, toWithdraw);
    }

    /// @notice Rescue accidentally sent ERC20 tokens
    function rescueERC20(address token, uint256 amount) external onlyOwner {
        uint256 balance = SafeTransferLib.balanceOf(token, address(this));
        uint256 toRescue = amount == 0 ? balance : amount;
        SafeTransferLib.safeTransfer(token, msg.sender, toRescue);
    }

    /// @notice Rescue accidentally sent ERC721 tokens (cannot rescue LESS tokens)
    function rescueERC721(address token, uint256 tokenId) external onlyOwner {
        if (token == address(less)) revert CannotRescueLess();
        ERC721(token).transferFrom(address(this), msg.sender, tokenId);
    }

    /*//////////////////////////////////////////////////////////////
                          EXECUTOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Execute the bounty for the current window
    /// @dev Anyone can call this. Executor receives fixed reward. NFTs sent to bounty owner.
    function execute() external nonReentrant {
        if (paused) revert BountyPaused();
        if (mintsPerWindow == 0) revert InvalidConfig();
        if (!less.isWindowActive()) revert NoActiveWindow();

        uint256 windowId = less.windowCount();
        if (windowMinted[windowId]) revert WindowAlreadyMinted();
        if (specificWindowsOnly && !targetWindows[windowId]) revert WindowNotTargeted();

        // Calculate total cost
        uint256 mintCost = less.getMintCost(address(this), mintsPerWindow);
        uint256 totalCost = mintCost + executorReward;
        if (address(this).balance < totalCost) revert InsufficientFunds();

        // Mark window as minted before external calls
        windowMinted[windowId] = true;

        // Get starting token ID before mint
        uint256 startTokenId = less.totalSupply() + 1;

        // Execute mint
        less.mint{value: mintCost}(mintsPerWindow);

        // Transfer minted NFTs to bounty owner
        address bountyOwner = owner();
        for (uint256 i = 0; i < mintsPerWindow; i++) {
            ERC721(address(less)).transferFrom(address(this), bountyOwner, startTokenId + i);
        }

        // Pay executor reward
        if (executorReward > 0) {
            SafeTransferLib.safeTransferETH(msg.sender, executorReward);
        }

        emit BountyExecuted(msg.sender, windowId, mintsPerWindow, executorReward);
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if the bounty can be executed for the current window
    /// @return canClaim Whether execute() would succeed
    /// @return reason Human-readable reason if cannot execute
    function canExecute() external view returns (bool canClaim, string memory reason) {
        if (paused) return (false, "Bounty is paused");
        if (mintsPerWindow == 0) return (false, "Mints per window is 0");
        if (!less.isWindowActive()) return (false, "No active window");

        uint256 windowId = less.windowCount();
        if (windowMinted[windowId]) return (false, "Window already minted");
        if (specificWindowsOnly && !targetWindows[windowId]) return (false, "Window not targeted");

        uint256 mintCost = less.getMintCost(address(this), mintsPerWindow);
        uint256 totalCost = mintCost + executorReward;
        if (address(this).balance < totalCost) return (false, "Insufficient funds");

        return (true, "");
    }

    /// @notice Get comprehensive bounty status for frontend display
    function getBountyStatus() external view returns (
        bool isActive,
        bool isPaused,
        uint256 currentWindowId,
        bool windowActive,
        bool windowMintedAlready,
        bool windowTargeted,
        bool canClaim,
        uint256 mintCost,
        uint256 reward,
        uint256 totalCost,
        uint256 balance,
        uint256 configuredMintsPerWindow
    ) {
        isPaused = paused;
        isActive = !paused && mintsPerWindow > 0;
        currentWindowId = less.windowCount();
        windowActive = less.isWindowActive();
        windowMintedAlready = windowMinted[currentWindowId];
        windowTargeted = !specificWindowsOnly || targetWindows[currentWindowId];

        mintCost = less.getMintCost(address(this), mintsPerWindow);
        reward = executorReward;
        totalCost = mintCost + reward;
        balance = address(this).balance;
        configuredMintsPerWindow = mintsPerWindow;

        canClaim = isActive && windowActive && !windowMintedAlready && windowTargeted && balance >= totalCost;
    }

    /// @notice Get the cost to execute for the current window
    /// @return mintCost Cost of minting
    /// @return reward Fixed reward for executor
    /// @return total Total cost (mintCost + reward)
    function getExecutionCost() external view returns (uint256 mintCost, uint256 reward, uint256 total) {
        mintCost = less.getMintCost(address(this), mintsPerWindow);
        reward = executorReward;
        total = mintCost + reward;
    }

    /// @notice Get the current balance available for bounties
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Check if a specific window is targeted
    function isWindowTargeted(uint256 windowId) external view returns (bool) {
        return !specificWindowsOnly || targetWindows[windowId];
    }

    /// @notice ERC721 receiver hook
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
