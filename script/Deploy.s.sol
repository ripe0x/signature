// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";

contract DeployScript is Script {
    function run() external {
        // Load environment variables
        address strategy = vm.envAddress("STRATEGY_ADDRESS");
        uint256 mintPrice = vm.envOr("MINT_PRICE", uint256(0.01 ether));
        address payoutRecipient = vm.envAddress("PAYOUT_RECIPIENT");
        address owner = vm.envAddress("OWNER_ADDRESS");

        // Scripty addresses (mainnet)
        // Updated ScriptyBuilderV2 address: 0xD7587F110E08F4D120A231bA97d3B577A81Df022
        address scriptyBuilder = vm.envOr(
            "SCRIPTY_BUILDER",
            address(0xD7587F110E08F4D120A231bA97d3B577A81Df022) // ScriptyBuilderV2 mainnet (updated)
        );
        address scriptyStorage = vm.envOr(
            "SCRIPTY_STORAGE",
            address(0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699) // ScriptyStorageV2 mainnet (updated)
        );
        string memory scriptName = vm.envOr("SCRIPT_NAME", string("less"));
        string memory baseImageURL = vm.envOr(
            "BASE_IMAGE_URL",
            string("https://example.com/less/")
        );

        vm.startBroadcast();

        // Deploy Less NFT contract
        Less less = new Less(strategy, mintPrice, payoutRecipient, owner);
        console.log("Less deployed at:", address(less));

        // Deploy LessRenderer
        LessRenderer renderer = new LessRenderer(
            address(less),
            scriptyBuilder,
            scriptyStorage,
            scriptName,
            baseImageURL,
            owner
        );
        console.log("LessRenderer deployed at:", address(renderer));

        vm.stopBroadcast();

        // Set renderer on Less contract (must be called by owner)
        // Always broadcast the setRenderer call, impersonating owner if needed
        if (owner != msg.sender) {
            // Impersonate owner and broadcast
            vm.startBroadcast(owner);
            less.setRenderer(address(renderer));
            vm.stopBroadcast();
        } else {
            // Owner is deployer, broadcast normally
            vm.startBroadcast();
            less.setRenderer(address(renderer));
            vm.stopBroadcast();
        }

        console.log("Renderer set on Less contract");
    }
}
