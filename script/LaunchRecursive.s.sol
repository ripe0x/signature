// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IStrategyPublicLauncher {
    function launchRecursive(string memory name, string memory ticker, string memory metadata) external payable;
    function recursiveLaunchPrice() external view returns (uint256);
    function isPaused() external view returns (bool);
}

contract LaunchRecursive is Script {
    // StrategyPublicLauncher on mainnet
    address constant LAUNCHER = 0xD7b44667D1Eb4f5fbB5D64B1c640358Ee3E72CF5;

    function run() external {
        string memory name = "LESS";
        string memory ticker = "LESS";
        string memory metadata = "data:application/json;base64,eyJpbWFnZSI6Imh0dHBzOi8vbGVzcy5yaXBlLnd0Zi9sZXNzLWxvZ28ucG5nIn0=";

        IStrategyPublicLauncher launcher = IStrategyPublicLauncher(LAUNCHER);

        // Check contract state
        uint256 launchPrice = launcher.recursiveLaunchPrice();
        bool paused = launcher.isPaused();

        console.log("Launch Price:", launchPrice);
        console.log("Is Paused:", paused);
        console.log("Token Name:", name);
        console.log("Token Ticker:", ticker);
        console.log("Metadata:", metadata);

        require(!paused, "Contract is paused");

        vm.startBroadcast();

        launcher.launchRecursive{value: launchPrice}(name, ticker, metadata);

        vm.stopBroadcast();

        console.log("Recursive token launched successfully!");
    }
}
