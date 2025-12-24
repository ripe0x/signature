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
/// @dev Created by LessBountyFactory. Allows owner to set mint targets and incentives.
///      Anyone can execute mints and claim the incentive.
contract LessBounty is Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event ConfigUpdated(uint256 mintsPerWindow, uint256 incentivePerWindow);
    event BountyExecuted(address indexed executor, uint256 windowId, uint256 quantity, uint256 incentive);
    event TargetWindowSet(uint256 indexed windowId, bool enabled);
    event Funded(address indexed funder, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event NFTWithdrawn(address indexed recipient, uint256 tokenId);
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

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The LESS NFT contract
    ILess public immutable less;

    /// @notice Number of mints to execute per window
    uint256 public mintsPerWindow;

    /// @notice ETH incentive paid to executor per window
    uint256 public incentivePerWindow;

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

    /// @notice Creates a new LessBounty contract
    /// @param _less Address of the LESS NFT contract
    /// @param _owner Address of the bounty owner
    /// @param _mintsPerWindow Initial mints per window (0 to skip)
    /// @param _incentivePerWindow Initial incentive per window
    constructor(address _less, address _owner, uint256 _mintsPerWindow, uint256 _incentivePerWindow) {
        less = ILess(_less);
        _initializeOwner(_owner);
        if (_mintsPerWindow > 0) {
            mintsPerWindow = _mintsPerWindow;
            incentivePerWindow = _incentivePerWindow;
            emit ConfigUpdated(_mintsPerWindow, _incentivePerWindow);
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
    /// @param _mintsPerWindow Number of mints per window (0 to disable)
    /// @param _incentivePerWindow ETH incentive for executor per window
    function configure(uint256 _mintsPerWindow, uint256 _incentivePerWindow) external onlyOwner {
        mintsPerWindow = _mintsPerWindow;
        incentivePerWindow = _incentivePerWindow;
        emit ConfigUpdated(_mintsPerWindow, _incentivePerWindow);
    }

    /// @notice Pause or unpause the bounty
    /// @param _paused Whether to pause
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /// @notice Enable or disable specific windows mode
    /// @param _enabled If true, only executes for targeted windows
    function setSpecificWindowsOnly(bool _enabled) external onlyOwner {
        specificWindowsOnly = _enabled;
    }

    /// @notice Set a target window
    /// @param windowId The window to target
    /// @param enabled Whether to enable this window as a target
    function setTargetWindow(uint256 windowId, bool enabled) external onlyOwner {
        targetWindows[windowId] = enabled;
        emit TargetWindowSet(windowId, enabled);
    }

    /// @notice Set multiple target windows at once
    /// @param windowIds Array of window IDs to set
    /// @param enabled Whether to enable these windows as targets
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

    /// @notice Withdraw an NFT from the contract
    /// @param tokenId The token ID to withdraw
    function withdrawNFT(uint256 tokenId) external onlyOwner {
        ERC721(address(less)).safeTransferFrom(address(this), msg.sender, tokenId);
        emit NFTWithdrawn(msg.sender, tokenId);
    }

    /// @notice Withdraw multiple NFTs from the contract
    /// @param tokenIds Array of token IDs to withdraw
    function withdrawNFTs(uint256[] calldata tokenIds) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            ERC721(address(less)).safeTransferFrom(address(this), msg.sender, tokenIds[i]);
            emit NFTWithdrawn(msg.sender, tokenIds[i]);
        }
    }

    /*//////////////////////////////////////////////////////////////
                          EXECUTOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Execute the bounty for the current window
    /// @dev Anyone can call this. Executor receives the incentive. NFTs sent to bounty owner.
    function execute() external nonReentrant {
        if (paused) revert BountyPaused();
        if (mintsPerWindow == 0) revert InvalidConfig();
        if (!less.isWindowActive()) revert NoActiveWindow();

        uint256 windowId = less.windowCount();
        if (windowMinted[windowId]) revert WindowAlreadyMinted();
        if (specificWindowsOnly && !targetWindows[windowId]) revert WindowNotTargeted();

        // Calculate cost
        uint256 mintCost = less.getMintCost(address(this), mintsPerWindow);
        uint256 totalCost = mintCost + incentivePerWindow;
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

        // Pay executor incentive
        if (incentivePerWindow > 0) {
            SafeTransferLib.safeTransferETH(msg.sender, incentivePerWindow);
        }

        emit BountyExecuted(msg.sender, windowId, mintsPerWindow, incentivePerWindow);
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if the bounty can be executed
    /// @return canExecute Whether execute() would succeed
    /// @return reason Human-readable reason if cannot execute
    function canExecute() external view returns (bool canExecute, string memory reason) {
        if (paused) return (false, "Bounty is paused");
        if (mintsPerWindow == 0) return (false, "Mints per window is 0");
        if (!less.isWindowActive()) return (false, "No active window");

        uint256 windowId = less.windowCount();
        if (windowMinted[windowId]) return (false, "Window already minted");
        if (specificWindowsOnly && !targetWindows[windowId]) return (false, "Window not targeted");

        uint256 mintCost = less.getMintCost(address(this), mintsPerWindow);
        uint256 totalCost = mintCost + incentivePerWindow;
        if (address(this).balance < totalCost) return (false, "Insufficient funds");

        return (true, "");
    }

    /// @notice Get the cost to execute for the current window
    /// @return mintCost Cost of minting
    /// @return incentive Incentive for executor
    /// @return total Total cost (mintCost + incentive)
    function getExecutionCost() external view returns (uint256 mintCost, uint256 incentive, uint256 total) {
        mintCost = less.getMintCost(address(this), mintsPerWindow);
        incentive = incentivePerWindow;
        total = mintCost + incentive;
    }

    /// @notice Get the current balance available for bounties
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice ERC721 receiver hook
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
