// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

interface IRipeStrategy {
    function addFeesManual() external payable;
    function currentFees() external view returns (uint256);
    function ethToTwap() external view returns (uint256);
}

/// @title AddFeesManual
/// @notice Script to manually add fees to the RipeStrategy contract
contract AddFeesManual is Script {
    // Mainnet strategy address
    address constant STRATEGY = 0x9C2CA573009F181EAc634C4d6e44A0977C24f335;

    function run() external {
        // Default to 0.001 ETH for testing, can override with AMOUNT env var
        uint256 amount = vm.envOr("AMOUNT", uint256(0.001 ether));

        address strategy = vm.envOr("STRATEGY_ADDRESS", STRATEGY);

        console.log("=== Add Fees Manual ===");
        console.log("Strategy:", strategy);
        console.log("Amount:", amount, "wei");
        console.log("Amount:", amount / 1e15, "finney (0.001 ETH units)");

        // Check current state before
        IRipeStrategy ripe = IRipeStrategy(strategy);

        try ripe.currentFees() returns (uint256 feesBefore) {
            console.log("Current fees before:", feesBefore);
        } catch {
            console.log("Could not read currentFees");
        }

        try ripe.ethToTwap() returns (uint256 ethToTwapBefore) {
            console.log("ETH to TWAP before:", ethToTwapBefore);
        } catch {
            console.log("Could not read ethToTwap");
        }

        vm.startBroadcast();

        ripe.addFeesManual{value: amount}();
        console.log("addFeesManual() called successfully!");

        vm.stopBroadcast();

        // Check state after
        try ripe.currentFees() returns (uint256 feesAfter) {
            console.log("Current fees after:", feesAfter);
        } catch {}

        try ripe.ethToTwap() returns (uint256 ethToTwapAfter) {
            console.log("ETH to TWAP after:", ethToTwapAfter);
        } catch {}
    }
}
