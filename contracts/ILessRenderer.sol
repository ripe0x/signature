// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ILessRenderer
/// @notice Interface for the Less NFT metadata renderer
interface ILessRenderer {
    /// @notice Returns the complete tokenURI for a given token
    /// @param tokenId The token ID to generate metadata for
    /// @return A data:application/json;base64,... URI containing the token metadata
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
