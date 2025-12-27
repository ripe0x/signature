// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {LessBountyFactory} from "../contracts/LessBountyFactory.sol";
import {LessBounty} from "../contracts/LessBounty.sol";

/// @title DeployBounty
/// @notice Deploys the LessBounty system (Factory + Implementation)
/// @dev Usage:
///   Dry run:
///     forge script script/DeployBounty.s.sol --tc DeployBounty -vvv
///
///   Deploy to mainnet:
///     forge script script/DeployBounty.s.sol --tc DeployBounty \
///       --rpc-url $MAINNET_RPC_URL \
///       --private-key $PRIVATE_KEY \
///       --broadcast
///
///   Deploy and verify:
///     forge script script/DeployBounty.s.sol --tc DeployBounty \
///       --rpc-url $MAINNET_RPC_URL \
///       --private-key $PRIVATE_KEY \
///       --broadcast \
///       --verify \
///       --etherscan-api-key $ETHERSCAN_API_KEY
contract DeployBounty is Script {
    // Mainnet LESS NFT contract
    address constant LESS_NFT = 0x008B66385ed2346E6895031E250B2ac8dc14605C;

    function run() external {
        console.log("Deploying LessBounty system...");
        console.log("LESS NFT address:", LESS_NFT);
        console.log("Deployer:", msg.sender);

        vm.startBroadcast();

        // Deploy factory (which deploys the implementation internally)
        LessBountyFactory factory = new LessBountyFactory(LESS_NFT);

        vm.stopBroadcast();

        // Get the implementation address
        address implementation = factory.implementation();

        console.log("");
        console.log("========================================");
        console.log("         DEPLOYMENT COMPLETE");
        console.log("========================================");
        console.log("");
        console.log("LessBountyFactory:", address(factory));
        console.log("LessBounty (impl):", implementation);
        console.log("");
        console.log("----------------------------------------");
        console.log("If verification didn't run automatically,");
        console.log("use these manual commands:");
        console.log("----------------------------------------");
        console.log("");
        console.log("# Verify Factory:");
        console.log(
            string.concat(
                "forge verify-contract ",
                vm.toString(address(factory)),
                " contracts/LessBountyFactory.sol:LessBountyFactory --constructor-args $(cast abi-encode 'constructor(address)' ",
                vm.toString(LESS_NFT),
                ") --chain mainnet --etherscan-api-key $ETHERSCAN_API_KEY"
            )
        );
        console.log("");
        console.log("# Verify Implementation:");
        console.log(
            string.concat(
                "forge verify-contract ",
                vm.toString(implementation),
                " contracts/LessBounty.sol:LessBounty --constructor-args $(cast abi-encode 'constructor(address)' ",
                vm.toString(LESS_NFT),
                ") --chain mainnet --etherscan-api-key $ETHERSCAN_API_KEY"
            )
        );
        console.log("");
        console.log("========================================");
        console.log("Don't forget to update frontend/src/lib/contracts.ts");
        console.log("with the new factory address!");
        console.log("========================================");
    }
}

/// @title DeployBountySepolia
/// @notice Deploys to Sepolia testnet for testing
/// @dev Usage:
///   forge script script/DeployBounty.s.sol --tc DeployBountySepolia \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
contract DeployBountySepolia is Script {
    // You'll need to deploy a test LESS contract on Sepolia first
    // or use an existing test address
    address constant LESS_NFT_SEPOLIA = address(0); // Update this!

    function run() external {
        require(LESS_NFT_SEPOLIA != address(0), "Set LESS_NFT_SEPOLIA address first");

        console.log("Deploying LessBounty system to Sepolia...");
        console.log("LESS NFT address:", LESS_NFT_SEPOLIA);

        vm.startBroadcast();
        LessBountyFactory factory = new LessBountyFactory(LESS_NFT_SEPOLIA);
        vm.stopBroadcast();

        console.log("");
        console.log("LessBountyFactory:", address(factory));
        console.log("LessBounty (impl):", factory.implementation());
    }
}
