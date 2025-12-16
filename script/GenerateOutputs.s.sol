// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Less} from "../contracts/Less.sol";

/// @title GenerateOutputsScript
/// @notice Generates tokenURIs for deployed tokens
/// @dev Reads contract address from deployment JSON or environment
///      Can optionally mint tokens if none exist
contract GenerateOutputsScript is Script {
    function run() external {
        // Load contract address
        address lessAddress = vm.envOr(
            "LESS_ADDRESS",
            vm.envAddress("LESS_ADDRESS")
        );

        // Load configuration
        string memory tokenIdsStr = vm.envOr("TOKEN_IDS", string(""));
        uint256 numTokensToMint = vm.envOr("NUM_TOKENS_TO_MINT", uint256(0));
        bool autoMint = vm.envOr("AUTO_MINT", false);

        Less less = Less(lessAddress);

        // Check current supply
        uint256 currentSupply = less.totalSupply();
        console.log("Current total supply:", currentSupply);

        // If no tokens and auto-mint is enabled, mint some
        if (currentSupply == 0 && (autoMint || numTokensToMint > 0)) {
            uint256 tokensToMint = numTokensToMint > 0 ? numTokensToMint : 5; // Default 5 tokens
            console.log("No tokens minted. Minting", tokensToMint, "tokens...");
            console.log("");

            // Only broadcast for minting (not for reading tokenURIs)
            vm.startBroadcast();
            _mintTokens(less, tokensToMint);
            vm.stopBroadcast();

            currentSupply = less.totalSupply();
            console.log("Minted", currentSupply, "tokens");
            console.log("");
        }

        // If no token IDs specified, get total supply
        uint256[] memory tokenIds;
        if (bytes(tokenIdsStr).length == 0) {
            require(
                currentSupply > 0,
                "No tokens minted. Set AUTO_MINT=true or NUM_TOKENS_TO_MINT=N"
            );

            tokenIds = new uint256[](currentSupply);
            for (uint256 i = 0; i < currentSupply; i++) {
                tokenIds[i] = i + 1;
            }
        } else {
            // Parse comma-separated token IDs
            // Simple parsing - split by comma
            bytes memory idsBytes = bytes(tokenIdsStr);
            uint256 count = 1; // Count commas + 1
            for (uint256 i = 0; i < idsBytes.length; i++) {
                if (idsBytes[i] == bytes1(",")) {
                    count++;
                }
            }

            tokenIds = new uint256[](count);
            uint256 current = 0;
            uint256 start = 0;

            for (uint256 i = 0; i <= idsBytes.length; i++) {
                if (i == idsBytes.length || idsBytes[i] == bytes1(",")) {
                    bytes memory numBytes = new bytes(i - start);
                    for (uint256 j = 0; j < i - start; j++) {
                        numBytes[j] = idsBytes[start + j];
                    }
                    tokenIds[current] = _parseUint(string(numBytes));
                    current++;
                    start = i + 1;
                }
            }
        }

        console.log("=== Generating Token URIs ===");
        console.log("Contract:", lessAddress);
        console.log("Tokens to generate:", tokenIds.length);
        console.log("");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];

            // Get token data
            bytes32 seed = less.getSeed(tokenId);
            uint256 foldId = less.getTokenData(tokenId).foldId;

            // Get tokenURI
            string memory uri = less.tokenURI(tokenId);

            console.log("--- Token", tokenId, "---");
            console.log("Fold ID:", foldId);
            console.logBytes32(seed);
            console.log("TokenURI:");
            console.log(uri);
            console.log("");
        }

        console.log("=== Complete ===");
    }

    /// @notice Mints tokens by creating folds and minting during windows
    function _mintTokens(Less less, uint256 numTokens) internal {
        uint256 mintPrice = less.mintPrice();
        address strategyAddress = address(less.strategy());

        uint256 tokensMinted = 0;
        uint256 foldCount = 0;
        uint256 userCounter = 1000;

        while (tokensMinted < numTokens) {
            // Check if window is active
            bool windowActive = less.isWindowActive();

            if (!windowActive) {
                // Need to create a fold
                console.log("Creating fold", foldCount + 1, "...");

                // Advance block for unique blockhash
                vm.roll(block.number + 5);

                // Try to prepare strategy for burn (add ETH if it's a mock strategy)
                // Real strategies should already have ETH from fees
                // On fork, real strategies may not have ETH - we'll try to add it anyway
                (bool success, ) = strategyAddress.call{value: 0.5 ether}(
                    abi.encodeWithSignature("addETH()")
                );

                // If addETH failed, try to send ETH directly to strategy
                // Some strategies might accept ETH via receive() or fallback
                if (!success) {
                    (bool sent, ) = strategyAddress.call{value: 0.5 ether}("");
                    // If that also fails, the strategy might need ETH from other sources
                    // For testing, we'll continue and let createFold handle the error
                }

                // Create the fold (triggers strategy burn)
                // This will revert if strategy doesn't have ETH
                less.createFold();
                foldCount++;
                console.log("  Fold created, window active");
            }

            // Mint a token in the active window
            address minter = address(uint160(userCounter++));
            vm.deal(minter, mintPrice * 2); // Give minter enough ETH

            vm.prank(minter);
            less.mint{value: mintPrice}();

            tokensMinted++;
            console.log("  Minted token", tokensMinted);

            // If we need more tokens, wait for window to close and create next fold
            if (tokensMinted < numTokens) {
                // Fast forward time to close the window (add 1 minute buffer)
                uint256 windowDuration = less.windowDuration();
                vm.warp(block.timestamp + windowDuration + 1 minutes);
                vm.roll(block.number + 1);
            }
        }
    }

    function _parseUint(string memory s) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 result = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (uint8(b[i]) >= 48 && uint8(b[i]) <= 57) {
                result = result * 10 + (uint8(b[i]) - 48);
            }
        }
        return result;
    }
}
