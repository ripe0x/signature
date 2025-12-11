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
        address scriptyBuilder = vm.envOr(
            "SCRIPTY_BUILDER",
            address(0x16b727a2Fc9322C724F4Bc562910c99a5edA5084) // ScriptyBuilderV2 mainnet
        );
        address scriptyStorage = vm.envOr(
            "SCRIPTY_STORAGE",
            address(0x096451F43800f207FC32B4FF86F286EdaF736eE3) // ScriptyStorageV2 mainnet
        );
        string memory scriptName = vm.envOr("SCRIPT_NAME", string("less"));
        string memory baseImageURL = vm.envOr("BASE_IMAGE_URL", string("https://example.com/less/"));

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

        // Set renderer on Less contract
        less.setRenderer(address(renderer));
        console.log("Renderer set on Less contract");

        vm.stopBroadcast();
    }
}
