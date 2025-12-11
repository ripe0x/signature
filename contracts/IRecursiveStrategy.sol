// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRecursiveStrategy
/// @notice Minimal interface for interacting with the RecursiveStrategy token
/// @dev The Less NFT contract uses this to trigger burns and read timing info
interface IRecursiveStrategy {
    /// @notice The time in seconds between each self-consumption burn event
    function timeBetweenBurn() external view returns (uint256);

    /// @notice The timestamp of the last burn event
    function lastBurn() external view returns (uint256);

    /// @notice Returns the time in seconds until the next burn can occur
    /// @return 0 if burn is available now, otherwise seconds remaining
    function timeUntilFundsMoved() external view returns (uint256);

    /// @notice Current total supply of the strategy token
    function totalSupply() external view returns (uint256);

    /// @notice Processes token buyback using TWAP mechanism
    /// @dev Buys tokens with accumulated ETH and burns them
    /// @dev Will revert if no ETH available or not enough blocks since last TWAP
    function processTokenTwap() external;
}
