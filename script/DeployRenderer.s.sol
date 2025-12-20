// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";

/// @title DeployRenderer
/// @notice Deploys only the LessRenderer contract
contract DeployRenderer is Script {
    address constant SCRIPTY_STORAGE = 0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699;
    address constant SCRIPTY_BUILDER = 0xD7587F110E08F4D120A231bA97d3B577A81Df022;

    function run() external returns (address) {
        address lessAddress = vm.envAddress("LESS_TOKEN_ADDRESS");
        string memory scriptName = vm.envOr("SCRIPT_NAME", string("lessFolds.js"));
        string memory baseImageURL = vm.envOr("BASE_IMAGE_URL", string("https://fold-image-api.fly.dev/images/"));
        address owner = vm.envOr("OWNER_ADDRESS", msg.sender);

        console.log("=== Deploy LessRenderer ===");
        console.log("Less contract:", lessAddress);
        console.log("Script name:", scriptName);
        console.log("Base image URL:", baseImageURL);
        console.log("Owner:", owner);

        vm.startBroadcast();

        LessRenderer renderer = new LessRenderer(
            LessRenderer.RendererConfig({
                less: lessAddress,
                scriptyBuilder: SCRIPTY_BUILDER,
                scriptyStorage: SCRIPTY_STORAGE,
                scriptName: scriptName,
                baseImageURL: baseImageURL,
                collectionName: "LESS",
                description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
                collectionImage: "https://fold-image-api.fly.dev/images/1",
                externalLink: "https://less.art",
                owner: owner
            })
        );

        vm.stopBroadcast();

        console.log("LessRenderer deployed at:", address(renderer));
        return address(renderer);
    }
}
