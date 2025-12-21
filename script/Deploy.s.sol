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
        uint256 windowDuration;
        bool useMockLess;
    }

    struct DeployedContracts {
        address less;
        address renderer;
        bool isMock;
    }

    // ============ Constants ============

    // ScriptyV2 addresses (same on mainnet and sepolia)
    address constant SCRIPTY_STORAGE =
        0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699;
    address constant SCRIPTY_BUILDER =
        0xD7587F110E08F4D120A231bA97d3B577A81Df022;

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

        // ============ STEP 1: Deploy Less ============
        console.log("=== Step 1/3: Deploying Less ===");
        vm.startBroadcast();
        if (config.useMockLess) {
            deployed.less = deployMockLess();
            deployed.isMock = true;
        } else {
            deployed.less = deployLess();
            deployed.isMock = false;
        }
        vm.stopBroadcast();

        // Verify Less deployment
        require(deployed.less != address(0), "Less deployment failed");
        require(deployed.less.code.length > 0, "Less has no code");
        console.log("[CONFIRMED] Less deployed at:", deployed.less);
        console.log("");

        // ============ STEP 2: Deploy Renderer ============
        console.log("=== Step 2/3: Deploying LessRenderer ===");
        vm.startBroadcast();
        deployed.renderer = deployRenderer(deployed.less);
        vm.stopBroadcast();

        // Verify Renderer deployment
        require(deployed.renderer != address(0), "Renderer deployment failed");
        require(deployed.renderer.code.length > 0, "Renderer has no code");
        console.log("[CONFIRMED] Renderer deployed at:", deployed.renderer);
        console.log("");

        // ============ STEP 3: Set Renderer ============
        console.log("=== Step 3/3: Setting Renderer ===");
        vm.startBroadcast();
        setRenderer(deployed.less, deployed.renderer, deployed.isMock);
        vm.stopBroadcast();

        // Verify renderer was set
        if (deployed.isMock) {
            address setRenderer_ = MockLess(payable(deployed.less)).renderer();
            require(setRenderer_ == deployed.renderer, "Renderer not set correctly on MockLess");
        } else {
            address setRenderer_ = Less(deployed.less).renderer();
            require(setRenderer_ == deployed.renderer, "Renderer not set correctly on Less");
        }
        console.log("[CONFIRMED] Renderer set successfully");
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
            revert(
                string.concat("Unsupported chain ID: ", vm.toString(chainId))
            );
        }
    }

    function getMainnetConfig() internal view returns (NetworkConfig memory) {
        string memory baseImageURL = vm.envOr(
            "BASE_IMAGE_URL",
            string("https://fold-image-api.fly.dev/images/")
        );
        return
            NetworkConfig({
                name: "mainnet",
                scriptyStorage: SCRIPTY_STORAGE,
                scriptyBuilder: SCRIPTY_BUILDER,
                strategy: vm.envAddress("STRATEGY_ADDRESS"),
                mintPrice: vm.envOr("MINT_PRICE", uint256(0.001 ether)),
                payoutRecipient: vm.envAddress("PAYOUT_RECIPIENT"),
                owner: vm.envAddress("OWNER_ADDRESS"),
                scriptName: vm.envOr("SCRIPT_NAME", string("less")),
                baseImageURL: baseImageURL,
                collectionName: "LESS",
                description: "a networked generative artwork about compression.",
                collectionImage: string(
                    "ipfs://bafkreigozkdzx7ykenebj3flfa5qlsi3rzp77hfph4jfuhs3hsrhs5ouvi"
                ),
                externalLink: "https://less.ripe.wtf",
                windowDuration: 90 minutes,
                useMockLess: false
            });
    }

    function getSepoliaConfig() internal view returns (NetworkConfig memory) {
        address deployer = vm.envOr("OWNER_ADDRESS", msg.sender);
        string memory baseImageURL = vm.envOr(
            "BASE_IMAGE_URL",
            string("https://fold-image-api.fly.dev/images/")
        );
        return
            NetworkConfig({
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
                collectionImage: string(
                    "ipfs://bafkreigozkdzx7ykenebj3flfa5qlsi3rzp77hfph4jfuhs3hsrhs5ouvi"
                ),
                externalLink: "https://less.art",
                windowDuration: 90 minutes,
                useMockLess: true
            });
    }

    function getLocalConfig() internal view returns (NetworkConfig memory) {
        // Local fork uses same Scripty addresses as mainnet/sepolia
        address deployer = vm.envOr("OWNER_ADDRESS", msg.sender);
        string memory baseImageURL = vm.envOr(
            "BASE_IMAGE_URL",
            string("https://fold-image-api.fly.dev/images/")
        );
        return
            NetworkConfig({
                name: "local",
                scriptyStorage: SCRIPTY_STORAGE,
                scriptyBuilder: SCRIPTY_BUILDER,
                strategy: address(0), // Use MockLess locally
                mintPrice: 0.001 ether,
                payoutRecipient: deployer,
                owner: deployer,
                scriptName: vm.envOr("SCRIPT_NAME", string("less-local")),
                baseImageURL: baseImageURL,
                collectionName: "LESS",
                description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
                collectionImage: string.concat(baseImageURL, "collection.png"),
                externalLink: "https://less.art",
                windowDuration: 90 minutes,
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
        require(
            config.payoutRecipient != address(0),
            "PAYOUT_RECIPIENT not set"
        );
        require(config.owner != address(0), "OWNER_ADDRESS not set");

        console.log("Deploying Less...");
        console.log("  Strategy:", config.strategy);
        console.log("  Mint price:", config.mintPrice);
        console.log("  Payout recipient:", config.payoutRecipient);
        console.log("  Owner:", config.owner);
        console.log("  Window duration:", config.windowDuration);

        Less less = new Less(
            config.strategy,
            config.mintPrice,
            config.payoutRecipient,
            config.owner,
            config.windowDuration
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

    function setRenderer(
        address lessAddress,
        address rendererAddress,
        bool isMock
    ) internal {
        console.log("Setting renderer on Less contract...");

        if (isMock) {
            MockLess(payable(lessAddress)).setRenderer(rendererAddress);
            console.log("Renderer set on MockLess");
            MockLess(payable(lessAddress)).transferOwnership(config.owner);
            console.log("MockLess ownership transferred to:", config.owner);
        } else {
            Less(lessAddress).setRenderer(rendererAddress);
            console.log("Renderer set on Less contract");
        }
    }

    // ============ Helper for Tests ============

    /// @notice Deploy with custom config (for testing)
    function runWithConfig(
        NetworkConfig memory customConfig
    ) external returns (DeployedContracts memory) {
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
