// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PayoutSplitter} from "../contracts/PayoutSplitter.sol";
import {Less} from "../contracts/Less.sol";

/// @title DeploySplitter
/// @notice Deploys PayoutSplitter and updates Less NFT payoutRecipient
/// @dev Run with:
///   forge script script/DeploySplitter.s.sol --rpc-url $RPC_URL --private-key $PK --broadcast --verify
///
/// Required environment variables:
///   LESS_TOKEN_ADDRESS - The upgraded $LESS token contract address (for fees)
///   LESS_NFT_ADDRESS - The Less NFT contract to update payoutRecipient on
///   OWNER_ADDRESS - The owner who can update the team address
///
/// Optional:
///   TEAM_ADDRESS - The team address that receives 80% (defaults to 0xea194A186EBe76A84E2B2027f5f23F81939c05AD)
///   ETHERSCAN_API_KEY - For contract verification
contract DeploySplitter is Script {
    address constant DEFAULT_TEAM = 0xea194A186EBe76A84E2B2027f5f23F81939c05AD;

    function run() external returns (address) {
        // Load configuration from environment
        address lessToken = vm.envAddress("LESS_TOKEN_ADDRESS");
        address lessNft = vm.envAddress("LESS_NFT_ADDRESS");
        address team = vm.envOr("TEAM_ADDRESS", DEFAULT_TEAM);
        address owner = vm.envAddress("OWNER_ADDRESS");

        console.log("=== DeploySplitter ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("");
        console.log("Configuration:");
        console.log("  LESS Token:", lessToken);
        console.log("  LESS NFT:", lessNft);
        console.log("  Team (80%):", team);
        console.log("  Owner:", owner);
        console.log("");

        // Validate addresses
        require(lessToken != address(0), "LESS_TOKEN_ADDRESS not set");
        require(lessNft != address(0), "LESS_NFT_ADDRESS not set");
        require(owner != address(0), "OWNER_ADDRESS not set");

        vm.startBroadcast();

        // Step 1: Deploy PayoutSplitter
        console.log("Step 1: Deploying PayoutSplitter...");
        PayoutSplitter splitter = new PayoutSplitter(lessToken, team, owner);
        console.log("  PayoutSplitter deployed:", address(splitter));

        // Step 2: Update payoutRecipient on Less NFT
        console.log("");
        console.log("Step 2: Updating payoutRecipient on Less NFT...");
        Less(lessNft).setPayoutRecipient(address(splitter));
        console.log("  payoutRecipient updated to:", address(splitter));

        vm.stopBroadcast();

        // Verify deployment
        require(address(splitter).code.length > 0, "No code at splitter address");
        require(splitter.lessToken() == lessToken, "lessToken mismatch");
        require(splitter.team() == team, "team mismatch");
        require(splitter.owner() == owner, "owner mismatch");
        require(Less(lessNft).payoutRecipient() == address(splitter), "payoutRecipient not updated");

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("PayoutSplitter:", address(splitter));
        console.log("Less NFT payoutRecipient:", Less(lessNft).payoutRecipient());

        return address(splitter);
    }
}
