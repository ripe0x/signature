// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LessBounty} from "./LessBounty.sol";

/// @title LessBountyFactory
/// @author ripe
/// @notice Factory for creating individual LessBounty contracts
/// @dev Each user gets their own bounty contract
contract LessBountyFactory {
    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct BountyInfo {
        address bountyAddress;
        address owner;
        bool canClaim;
        uint256 incentive;
        uint256 totalCost;
        uint256 balance;
        uint256 currentWindowId;
        bool windowActive;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event BountyCreated(address indexed owner, address indexed bounty);

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The LESS NFT contract address
    address public immutable less;

    /// @notice Mapping of user address to their bounty contract
    mapping(address => address) public bounties;

    /// @notice Array of all created bounty contracts
    address[] public allBounties;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates the factory
    /// @param _less Address of the LESS NFT contract
    constructor(address _less) {
        less = _less;
    }

    /*//////////////////////////////////////////////////////////////
                           PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Create a new bounty contract for the caller
    /// @return bounty Address of the created bounty contract
    function createBounty() external returns (address bounty) {
        return _createBountyFor(msg.sender, 0, 0);
    }

    /// @notice Create a bounty contract for a specific owner
    /// @param owner Address that will own the bounty
    /// @return bounty Address of the created bounty contract
    function createBountyFor(address owner) external returns (address bounty) {
        return _createBountyFor(owner, 0, 0);
    }

    /// @notice Create and configure a bounty in one transaction
    /// @param mintsPerWindow Number of mints per window
    /// @param incentivePerWindow ETH incentive for executor
    /// @return bounty Address of the created bounty contract
    function createAndConfigure(
        uint256 mintsPerWindow,
        uint256 incentivePerWindow
    ) external payable returns (address bounty) {
        bounty = _createBountyFor(msg.sender, mintsPerWindow, incentivePerWindow);
        if (msg.value > 0) {
            (bool success, ) = bounty.call{value: msg.value}("");
            require(success, "ETH transfer failed");
        }
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the bounty contract for a user
    /// @param owner Address to lookup
    /// @return bounty Address of the bounty contract (address(0) if none)
    function getBounty(address owner) external view returns (address) {
        return bounties[owner];
    }

    /// @notice Get all bounty contracts created
    /// @return Array of all bounty contract addresses
    function getAllBounties() external view returns (address[] memory) {
        return allBounties;
    }

    /// @notice Get the total number of bounties created
    function totalBounties() external view returns (uint256) {
        return allBounties.length;
    }

    /// @notice Get status of bounties with pagination
    /// @param start Starting index
    /// @param count Number of bounties to return (0 for all remaining)
    /// @return infos Array of BountyInfo structs
    function getBountyStatuses(uint256 start, uint256 count) external view returns (BountyInfo[] memory infos) {
        uint256 len = allBounties.length;
        if (start >= len) return new BountyInfo[](0);

        uint256 end = count == 0 ? len : start + count;
        if (end > len) end = len;
        uint256 size = end - start;

        infos = new BountyInfo[](size);

        for (uint256 i = 0; i < size; i++) {
            LessBounty b = LessBounty(payable(allBounties[start + i]));
            (
                ,  // isActive
                ,  // isPaused
                uint256 currentWindowId,
                bool windowActive,
                ,  // windowMintedAlready
                ,  // windowTargeted
                bool canClaim,
                ,  // mintCost
                uint256 incentive,
                uint256 totalCost,
                uint256 balance,
                   // configuredMintsPerWindow
            ) = b.getBountyStatus();

            infos[i] = BountyInfo({
                bountyAddress: allBounties[start + i],
                owner: b.owner(),
                canClaim: canClaim,
                incentive: incentive,
                totalCost: totalCost,
                balance: balance,
                currentWindowId: currentWindowId,
                windowActive: windowActive
            });
        }
    }

    /// @notice Get status of all bounties (convenience wrapper)
    /// @dev May run out of gas with many bounties - use getBountyStatuses() with pagination
    function getAllBountyStatuses() external view returns (BountyInfo[] memory) {
        return this.getBountyStatuses(0, 0);
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _createBountyFor(
        address owner,
        uint256 mintsPerWindow,
        uint256 incentivePerWindow
    ) internal returns (address bounty) {
        require(bounties[owner] == address(0), "Bounty already exists");

        bounty = address(new LessBounty(less, owner, mintsPerWindow, incentivePerWindow));
        bounties[owner] = bounty;
        allBounties.push(bounty);

        emit BountyCreated(owner, bounty);
    }
}
