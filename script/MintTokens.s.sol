
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Less} from "../contracts/Less.sol";

contract MintTokensScript is Script {
    function run() external {
        address lessAddress = vm.envAddress("LESS_ADDRESS");
        uint256 numMints = vm.envOr("NUM_MINTS", uint256(3));
        
        Less less = Less(lessAddress);
        uint256 mintPrice = less.mintPrice();
        
        uint256 userCounter = 1000;
        for (uint256 i = 0; i < numMints; i++) {
            address minter = address(uint160(userCounter++));
            // Fund minter with enough ETH for mint price + gas
            vm.deal(minter, mintPrice * 3); // Extra for gas
            
            // Impersonate minter and mint
            vm.startPrank(minter);
            less.mint{value: mintPrice}(1);
            vm.stopPrank();
            
            console.log("Minted token", less.totalSupply());
        }
        
        // Broadcast all mints at once from default account
        vm.startBroadcast();
        vm.stopBroadcast();
    }
}
