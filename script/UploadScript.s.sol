// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

/// @title IScriptyStorage
/// @notice Interface for ScriptyStorageV2 contract
interface IScriptyStorage {
    /// @notice Creates a new script entry
    /// @param name The name/identifier for the script
    /// @param details Additional metadata (usually empty bytes)
    function createScript(
        string calldata name,
        bytes calldata details
    ) external;

    /// @notice Adds a chunk of code to an existing script
    /// @param name The name/identifier of the script
    /// @param chunk The code chunk to append
    function addChunkToScript(
        string calldata name,
        bytes calldata chunk
    ) external;

    /// @notice Retrieves a script from storage
    /// @param name The name/identifier of the script
    /// @param data Additional data (usually empty)
    /// @return The script content as bytes
    function getScript(
        string memory name,
        bytes memory data
    ) external view returns (bytes memory);
}

/// @title UploadScript
/// @notice Uploads the image generation JavaScript to ScriptyStorage
/// @dev Best practices:
///      - Separate from deployment for flexibility
///      - Supports file path configuration
///      - Verifies upload success
///      - Handles large files (may need chunking for very large scripts)
///      - Idempotent (can be run multiple times)
contract UploadScript is Script {
    function run() external {
        // Load configuration from environment
        address scriptyStorage = vm.envOr(
            "SCRIPTY_STORAGE",
            address(0x096451F43800f207FC32B4FF86F286EdaF736eE3) // ScriptyStorageV2 mainnet
        );
        string memory scriptName = vm.envOr("SCRIPT_NAME", string("less"));

        // Path to the JavaScript file to upload
        // Default assumes a bundled/compiled version exists
        // You may need to build this first (e.g., using a bundler)
        string memory scriptPath = vm.envOr(
            "SCRIPT_PATH",
            string("web/onchain/bundled.js")
        );

        console.log("=== Uploading Script to ScriptyStorage ===");
        console.log("Storage contract:", scriptyStorage);
        console.log("Script name:", scriptName);
        console.log("Script path:", scriptPath);
        console.log("");

        // Read the script file
        string memory scriptContent = vm.readFile(scriptPath);
        bytes memory scriptBytes = bytes(scriptContent);

        uint256 scriptSize = scriptBytes.length;
        console.log("Script size:", scriptSize, "bytes");
        console.log("");

        // Start broadcast
        vm.startBroadcast();

        IScriptyStorage storageContract = IScriptyStorage(scriptyStorage);

        // Create the script entry
        console.log("Creating script entry...");
        storageContract.createScript(scriptName, "");
        console.log("Script entry created");

        // Upload the script in chunks (ScriptyStorageV2 requires chunked uploads)
        // Maximum chunk size is typically 24576 bytes (24KB) per chunk
        uint256 maxChunkSize = 24000; // Leave some margin
        uint256 totalChunks = (scriptSize + maxChunkSize - 1) / maxChunkSize;

        console.log("Uploading script in", totalChunks, "chunk(s)...");

        for (uint256 i = 0; i < totalChunks; i++) {
            uint256 start = i * maxChunkSize;
            uint256 end = start + maxChunkSize;
            if (end > scriptSize) {
                end = scriptSize;
            }

            bytes memory chunk = new bytes(end - start);
            for (uint256 j = 0; j < end - start; j++) {
                chunk[j] = scriptBytes[start + j];
            }

            storageContract.addChunkToScript(scriptName, chunk);
            console.log("  Chunk uploaded:");
            console.log("    Chunk number:", i + 1);
            console.log("    Total chunks:", totalChunks);
            console.log("    Chunk size:", chunk.length, "bytes");
        }

        console.log("SUCCESS: Script uploaded successfully");
        console.log("");

        // Verify the upload by reading it back
        console.log("Verifying upload...");
        try storageContract.getScript(scriptName, "") returns (
            bytes memory retrieved
        ) {
            if (keccak256(retrieved) == keccak256(scriptBytes)) {
                console.log(
                    "SUCCESS: Verification successful: Script matches uploaded content"
                );
                console.log("  Retrieved size:", retrieved.length, "bytes");
            } else {
                console.log(
                    "WARNING: Retrieved script does not match uploaded content!"
                );
                console.log("  Uploaded:", scriptBytes.length, "bytes");
                console.log("  Retrieved:", retrieved.length, "bytes");
            }
        } catch {
            console.log(
                "WARNING: Could not verify upload (getScript may have failed)"
            );
        }
        vm.stopBroadcast();

        console.log("");
        console.log("=== Upload Complete ===");
        console.log("Script name:", scriptName);
        console.log("Storage contract:", scriptyStorage);
        console.log("");
        console.log("You can now deploy contracts that reference this script.");
    }
}
