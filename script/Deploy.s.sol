// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";
import {MockLess} from "../contracts/test/MockLess.sol";

/// @title Deploy
/// @notice Unified deployment script for all environments (local, testnet, mainnet)
/// @dev Detects network via chain ID and uses appropriate configuration
contract Deploy is Script {
    // ============ Structs ============

    struct NetworkConfig {
        string name;
        address scriptyStorage;
        address scriptyBuilder;
        address strategy;
        uint256 mintPrice;
        address payoutRecipient;
        address owner;
        string scriptName;
        string baseImageURL;
        string collectionName;
        string description;
        string collectionImage;
        string externalLink;
        bool useMockLess;
    }

    struct DeployedContracts {
        address less;
        address renderer;
        bool isMock;
    }

    // ============ Constants ============

    // ScriptyV2 addresses (same on mainnet and sepolia)
    address constant SCRIPTY_STORAGE = 0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699;
    address constant SCRIPTY_BUILDER = 0xD7587F110E08F4D120A231bA97d3B577A81Df022;

    // Chain IDs
    uint256 constant MAINNET_CHAIN_ID = 1;
    uint256 constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 constant LOCAL_CHAIN_ID = 31337;

    // ============ State ============

    NetworkConfig public config;
    DeployedContracts public deployed;

    // ============ Main Entry Point ============

    function run() external returns (DeployedContracts memory) {
        // Load configuration based on network
        config = getNetworkConfig();

        console.log("=== Deployment Configuration ===");
        console.log("Network:", config.name);
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Using MockLess:", config.useMockLess);
        console.log("ScriptyStorage:", config.scriptyStorage);
        console.log("ScriptyBuilder:", config.scriptyBuilder);
        console.log("");

        vm.startBroadcast();

        // Deploy Less or MockLess based on network
        if (config.useMockLess) {
            deployed.less = deployMockLess();
            deployed.isMock = true;
        } else {
            deployed.less = deployLess();
            deployed.isMock = false;
        }

        // Deploy renderer
        deployed.renderer = deployRenderer(deployed.less);

        // Set renderer on Less/MockLess contract
        setRenderer(deployed.less, deployed.renderer, deployed.isMock);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Less:", deployed.less);
        console.log("Renderer:", deployed.renderer);

        return deployed;
    }

    // ============ Network Configuration ============

    function getNetworkConfig() public view returns (NetworkConfig memory) {
        uint256 chainId = block.chainid;

        if (chainId == MAINNET_CHAIN_ID) {
            return getMainnetConfig();
        } else if (chainId == SEPOLIA_CHAIN_ID) {
            return getSepoliaConfig();
        } else if (chainId == LOCAL_CHAIN_ID) {
            return getLocalConfig();
        } else {
            revert(string.concat("Unsupported chain ID: ", vm.toString(chainId)));
        }
    }

    function getMainnetConfig() internal view returns (NetworkConfig memory) {
        string memory baseImageURL = vm.envOr("BASE_IMAGE_URL", string("https://less.art/images/"));
        return NetworkConfig({
            name: "mainnet",
            scriptyStorage: SCRIPTY_STORAGE,
            scriptyBuilder: SCRIPTY_BUILDER,
            strategy: vm.envAddress("STRATEGY_ADDRESS"),
            mintPrice: vm.envOr("MINT_PRICE", uint256(0.01 ether)),
            payoutRecipient: vm.envAddress("PAYOUT_RECIPIENT"),
            owner: vm.envAddress("OWNER_ADDRESS"),
            scriptName: vm.envOr("SCRIPT_NAME", string("less")),
            baseImageURL: baseImageURL,
            collectionName: "LESS",
            description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
            collectionImage: string.concat(baseImageURL, "collection.png"),
            externalLink: "https://less.art",
            useMockLess: false
        });
    }

    function getSepoliaConfig() internal view returns (NetworkConfig memory) {
        address deployer = vm.envOr("OWNER_ADDRESS", msg.sender);
        string memory baseImageURL = vm.envOr("BASE_IMAGE_URL", string("https://less.art/images/"));
        return NetworkConfig({
            name: "sepolia",
            scriptyStorage: SCRIPTY_STORAGE,
            scriptyBuilder: SCRIPTY_BUILDER,
            strategy: address(0), // No strategy on testnet
            mintPrice: 0.001 ether,
            payoutRecipient: deployer,
            owner: deployer,
            scriptName: vm.envOr("SCRIPT_NAME", string("less-sepolia")),
            baseImageURL: baseImageURL,
            collectionName: "LESS",
            description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
            collectionImage: string.concat(baseImageURL, "collection.png"),
            externalLink: "https://less.art",
            useMockLess: true
        });
    }

    function getLocalConfig() internal view returns (NetworkConfig memory) {
        // Local fork uses same Scripty addresses as mainnet/sepolia
        address deployer = vm.envOr("OWNER_ADDRESS", msg.sender);
        string memory baseImageURL = vm.envOr("BASE_IMAGE_URL", string("https://less.art/images/"));
        return NetworkConfig({
            name: "local",
            scriptyStorage: SCRIPTY_STORAGE,
            scriptyBuilder: SCRIPTY_BUILDER,
            strategy: address(0), // Use MockLess locally
            mintPrice: 0.01 ether,
            payoutRecipient: deployer,
            owner: deployer,
            scriptName: vm.envOr("SCRIPT_NAME", string("less-local")),
            baseImageURL: baseImageURL,
            collectionName: "LESS",
            description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
            collectionImage: string.concat(baseImageURL, "collection.png"),
            externalLink: "https://less.art",
            useMockLess: true
        });
    }

    // ============ Deployment Functions ============

    function deployMockLess() internal returns (address) {
        console.log("Deploying MockLess...");
        MockLess mockLess = new MockLess();
        console.log("MockLess deployed at:", address(mockLess));
        return address(mockLess);
    }

    function deployLess() internal returns (address) {
        require(config.strategy != address(0), "STRATEGY_ADDRESS not set");
        require(config.payoutRecipient != address(0), "PAYOUT_RECIPIENT not set");
        require(config.owner != address(0), "OWNER_ADDRESS not set");

        console.log("Deploying Less...");
        console.log("  Strategy:", config.strategy);
        console.log("  Mint price:", config.mintPrice);
        console.log("  Payout recipient:", config.payoutRecipient);
        console.log("  Owner:", config.owner);

        Less less = new Less(
            config.strategy,
            config.mintPrice,
            config.payoutRecipient,
            config.owner
        );

        console.log("Less deployed at:", address(less));
        return address(less);
    }

    function deployRenderer(address lessAddress) internal returns (address) {
        require(config.scriptyStorage != address(0), "ScriptyStorage not set");
        require(config.scriptyBuilder != address(0), "ScriptyBuilder not set");

        console.log("Deploying LessRenderer...");
        console.log("  Less:", lessAddress);
        console.log("  ScriptyBuilder:", config.scriptyBuilder);
        console.log("  ScriptyStorage:", config.scriptyStorage);
        console.log("  Script name:", config.scriptName);
        console.log("  Base image URL:", config.baseImageURL);
        console.log("  Collection name:", config.collectionName);
        console.log("  External link:", config.externalLink);

        LessRenderer renderer = new LessRenderer(
            LessRenderer.RendererConfig({
                less: lessAddress,
                scriptyBuilder: config.scriptyBuilder,
                scriptyStorage: config.scriptyStorage,
                scriptName: config.scriptName,
                baseImageURL: config.baseImageURL,
                collectionName: config.collectionName,
                description: config.description,
                collectionImage: config.collectionImage,
                externalLink: config.externalLink,
                owner: config.owner
            })
        );

        console.log("LessRenderer deployed at:", address(renderer));
        return address(renderer);
    }

    function setRenderer(address lessAddress, address rendererAddress, bool isMock) internal {
        console.log("Setting renderer on Less contract...");

        if (isMock) {
            MockLess(lessAddress).transferOwnership(config.owner);
            // MockLess doesn't have setRenderer, it just provides data
            console.log("MockLess ownership transferred to:", config.owner);
        } else {
            Less(lessAddress).setRenderer(rendererAddress);
            console.log("Renderer set on Less contract");
        }
    }

    // ============ Helper for Tests ============

    /// @notice Deploy with custom config (for testing)
    function runWithConfig(NetworkConfig memory customConfig) external returns (DeployedContracts memory) {
        config = customConfig;

        vm.startBroadcast();

        if (config.useMockLess) {
            deployed.less = deployMockLess();
            deployed.isMock = true;
        } else {
            deployed.less = deployLess();
            deployed.isMock = false;
        }

        deployed.renderer = deployRenderer(deployed.less);
        setRenderer(deployed.less, deployed.renderer, deployed.isMock);

        vm.stopBroadcast();

        return deployed;
    }

    /// @notice Get the current network config without deploying
    function getConfig() external view returns (NetworkConfig memory) {
        return getNetworkConfig();
    }
}
