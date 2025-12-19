// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {LessRenderer} from "../LessRenderer.sol";

/// @notice Harness that exposes internal trait functions for testing
contract LessRendererTraitsHarness is LessRenderer {
    constructor()
        LessRenderer(
            RendererConfig({
                less: address(1),
                scriptyBuilder: address(2),
                scriptyStorage: address(3),
                scriptName: "test",
                baseImageURL: "https://test.com/",
                collectionName: "LESS",
                description: "Test",
                collectionImage: "https://test.com/collection.png",
                externalLink: "https://test.com",
                owner: msg.sender
            })
        )
    {}

    function getFoldStrategy(bytes32 seed) external pure returns (string memory) {
        return _getFoldStrategy(seed);
    }
    function getRenderMode(bytes32 seed) external pure returns (string memory) {
        return _getRenderMode(seed);
    }
    function getDrawDirection(bytes32 seed) external pure returns (string memory) {
        return _getDrawDirection(seed);
    }
    function getPaperType(bytes32 seed) external pure returns (string memory) {
        return _getPaperType(seed);
    }
    function hasPaperGrain(bytes32 seed) external pure returns (bool) {
        return _hasPaperGrain(seed);
    }
    function hasCreaseLines(bytes32 seed) external pure returns (bool) {
        return _hasCreaseLines(seed);
    }
    function hasHitCounts(bytes32 seed) external pure returns (bool) {
        return _hasHitCounts(seed);
    }
}

contract DeployTraitHarness is Script {
    function run() external {
        vm.startBroadcast();
        LessRendererTraitsHarness harness = new LessRendererTraitsHarness();
        console.log("Harness deployed at:", address(harness));
        vm.stopBroadcast();
    }
}
