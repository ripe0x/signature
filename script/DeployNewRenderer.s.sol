// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";

/// @title DeployNewRenderer
/// @notice Deploys a new renderer contract with the existing mainnet script and sets it on the token contract
/// @dev This script assumes the script is already uploaded to ScriptyStorage on mainnet
contract DeployNewRenderer is Script {
    address constant SCRIPTY_STORAGE =
        0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699;
    address constant SCRIPTY_BUILDER =
        0xD7587F110E08F4D120A231bA97d3B577A81Df022;

    function run() external returns (address) {
        // Get addresses from environment or use mainnet deployment address as fallback
        address lessAddress = vm.envOr(
            "LESS_NFT_ADDRESS",
            address(0x008B66385ed2346E6895031E250B2ac8dc14605C) // Mainnet Less NFT contract
        );
        address owner = vm.envOr("OWNER_ADDRESS", msg.sender);

        // Get script name from environment or use the one from deployment-mainnet.json
        // The script "lessFolds.js-v1766350961" should already be uploaded to mainnet
        string memory scriptName = vm.envOr(
            "SCRIPT_NAME",
            string("lessFolds.js-v1766350961")
        );
        string memory baseImageURL = vm.envOr(
            "BASE_IMAGE_URL",
            string("https://fold-image-api.fly.dev/images/")
        );

        console.log("=== Deploy New Renderer ===");
        console.log("Less contract:", lessAddress);
        console.log("Script name:", scriptName);
        console.log("Base image URL:", baseImageURL);
        console.log("Owner:", owner);
        console.log("");

        // Deploy renderer (can be from any address)
        vm.startBroadcast();
        console.log("[1] Deploying new LessRenderer...");
        LessRenderer newRenderer = new LessRenderer(
            LessRenderer.RendererConfig({
                less: lessAddress,
                scriptyBuilder: SCRIPTY_BUILDER,
                scriptyStorage: SCRIPTY_STORAGE,
                scriptName: scriptName,
                baseImageURL: baseImageURL,
                collectionName: "LESS",
                description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
                collectionImage: "ipfs://bafkreigozkdzx7ykenebj3flfa5qlsi3rzp77hfph4jfuhs3hsrhs5ouvi",
                externalLink: "https://less.ripe.wtf",
                owner: owner
            })
        );
        vm.stopBroadcast();

        address rendererAddress = address(newRenderer);
        console.log(
            "[CONFIRMED] New LessRenderer deployed at:",
            rendererAddress
        );
        console.log("");

        // Set the new renderer on the Less contract (must be from owner)
        console.log("[2] Setting renderer on Less contract...");
        vm.broadcast(owner);
        Less(lessAddress).setRenderer(rendererAddress);
        console.log("[CONFIRMED] Renderer set on Less contract");
        console.log("");

        // Verify the renderer was set (view call, no broadcast needed)
        address setRenderer = Less(lessAddress).renderer();
        require(setRenderer == rendererAddress, "Renderer not set correctly");
        console.log("[VERIFIED] Renderer address matches:", setRenderer);
        console.log("");

        console.log("=== Deployment Complete ===");
        console.log("New Renderer:", rendererAddress);
        console.log("Less Contract:", lessAddress);
        console.log("Script Name:", scriptName);
        console.log(
            "Note: The script",
            scriptName,
            "should already be uploaded to ScriptyStorage"
        );

        return rendererAddress;
    }
}
