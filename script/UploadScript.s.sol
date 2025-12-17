// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

/// @title IScriptyStorage
/// @notice Interface for ScriptyStorageV2 contract
interface IScriptyStorage {
    function createContent(string calldata name, bytes calldata details) external;
    function addChunkToContent(string calldata name, bytes calldata chunk) external;
    function getContent(string memory name, bytes memory data) external view returns (bytes memory);
}

/// @title UploadScript
/// @notice Uploads JavaScript to ScriptyStorage with network detection
/// @dev Supports mainnet, sepolia, and local (fork) environments
contract UploadScript is Script {
    // ScriptyV2 address (same on mainnet and sepolia)
    address constant SCRIPTY_STORAGE = 0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699;

    // Chain IDs
    uint256 constant MAINNET_CHAIN_ID = 1;
    uint256 constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 constant LOCAL_CHAIN_ID = 31337;

    // Maximum chunk size (24KB with some margin)
    uint256 constant MAX_CHUNK_SIZE = 24000;

    function run() external {
        // Get ScriptyStorage address based on network
        address scriptyStorage = getScriptyStorage();
        string memory scriptName = getScriptName();
        string memory scriptPath = vm.envOr("SCRIPT_PATH", string("web/onchain/bundled.js"));

        console.log("=== Upload Script to ScriptyStorage ===");
        console.log("Network:", getNetworkName());
        console.log("Chain ID:", block.chainid);
        console.log("Storage:", scriptyStorage);
        console.log("Script name:", scriptName);
        console.log("Script path:", scriptPath);
        console.log("");

        // Read the script file
        string memory scriptContent = vm.readFile(scriptPath);
        bytes memory scriptBytes = bytes(scriptContent);
        uint256 scriptSize = scriptBytes.length;

        console.log("Script size:", scriptSize, "bytes");

        uint256 totalChunks = (scriptSize + MAX_CHUNK_SIZE - 1) / MAX_CHUNK_SIZE;
        console.log("Chunks required:", totalChunks);
        console.log("");

        vm.startBroadcast();

        IScriptyStorage storage_ = IScriptyStorage(scriptyStorage);

        // Create content entry
        console.log("[1] Creating content entry...");
        try storage_.createContent(scriptName, "") {
            console.log("    Content entry created");
        } catch {
            console.log("    Content entry may already exist, continuing...");
        }

        // Upload chunks
        console.log("[2] Uploading chunks...");
        for (uint256 i = 0; i < totalChunks; i++) {
            uint256 start = i * MAX_CHUNK_SIZE;
            uint256 end = start + MAX_CHUNK_SIZE;
            if (end > scriptSize) {
                end = scriptSize;
            }

            bytes memory chunk = new bytes(end - start);
            for (uint256 j = 0; j < end - start; j++) {
                chunk[j] = scriptBytes[start + j];
            }

            storage_.addChunkToContent(scriptName, chunk);
            console.log("    Chunk uploaded:", chunk.length, "bytes");
        }

        vm.stopBroadcast();

        // Verify upload
        console.log("");
        console.log("[3] Verifying upload...");
        try storage_.getContent(scriptName, "") returns (bytes memory retrieved) {
            if (keccak256(retrieved) == keccak256(scriptBytes)) {
                console.log("    SUCCESS: Upload verified");
                console.log("    Stored size:", retrieved.length, "bytes");
            } else {
                console.log("    WARNING: Content mismatch!");
                console.log("    Uploaded:", scriptBytes.length, "bytes");
                console.log("    Retrieved:", retrieved.length, "bytes");
            }
        } catch {
            console.log("    WARNING: Could not verify upload");
        }

        console.log("");
        console.log("=== Upload Complete ===");
    }

    function getScriptyStorage() public view returns (address) {
        // ScriptyV2 has same address on all networks
        return SCRIPTY_STORAGE;
    }

    function getScriptName() public view returns (string memory) {
        string memory defaultName;
        uint256 chainId = block.chainid;

        if (chainId == MAINNET_CHAIN_ID) {
            defaultName = "less";
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            defaultName = "less-sepolia";
        } else {
            defaultName = "less-local";
        }

        return vm.envOr("SCRIPT_NAME", defaultName);
    }

    function getNetworkName() public view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == MAINNET_CHAIN_ID) return "mainnet";
        if (chainId == SEPOLIA_CHAIN_ID) return "sepolia";
        if (chainId == LOCAL_CHAIN_ID) return "local";
        return "unknown";
    }
}
