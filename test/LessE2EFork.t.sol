// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";
import {IRecursiveStrategy} from "../contracts/IRecursiveStrategy.sol";

/**
 * @title LessE2EForkTest
 * @notice End-to-end fork test for Less.sol <> $LESS ERC20 (RipeStrategy) integration
 * @dev Tests the full buy + burn <> mint relationship between Less.sol and the $LESS ERC20 contract
 *
 * Run with:
 *   MAINNET_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/..." forge test --match-contract LessE2EFork --fork-url "$MAINNET_RPC_URL" -vvvv
 */
contract LessE2EForkTest is Test {
    // $LESS ERC20 (RipeStrategy) contract on mainnet
    address constant LESS_ERC20 = 0x9C2CA573009F181EAc634C4d6e44A0977C24f335;

    // Owner of the $LESS ERC20 contract (can call setTokenTwapAddress)
    address constant LESS_ERC20_OWNER = 0x019817aD02a31B990433542097bE29D97613E8Cb;

    // Mainnet Scripty V2 contracts
    address constant SCRIPTY_BUILDER_V2 = 0xD7587F110E08F4D120A231bA97d3B577A81Df022;
    address constant SCRIPTY_STORAGE_V2 = 0xbD11994aABB55Da86DC246EBB17C1Be0af5b7699;

    // Dead address for burn verification
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // Storage slots in RipeStrategy
    // Note: Slot layout differs from RecursiveStrategy
    uint256 constant ETH_TO_TWAP_SLOT = 6;

    Less public less;
    LessRenderer public renderer;

    address public owner = makeAddr("lessOwner");
    address public payout = makeAddr("payout");

    // Test users
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 public constant MINT_PRICE = 0.001 ether;

    // Script upload constants
    uint256 constant MAX_CHUNK_SIZE = 24000;
    string constant SCRIPT_NAME = "less-fork-test";
    string constant SCRIPT_PATH = "web/onchain/bundled.js";

    function setUp() public {
        // Verify we're on a mainnet fork
        require(block.chainid == 1, "Must run on mainnet fork");

        // Upload script to ScriptyStorage first
        _uploadScriptToScripty();

        vm.startPrank(owner);

        // Deploy Less NFT contract pointing to $LESS ERC20 as the strategy
        less = new Less(LESS_ERC20, MINT_PRICE, payout, owner, 90 minutes);

        // Deploy renderer with real Scripty contracts
        renderer = new LessRenderer(
            LessRenderer.RendererConfig({
                less: address(less),
                scriptyBuilder: SCRIPTY_BUILDER_V2,
                scriptyStorage: SCRIPTY_STORAGE_V2,
                scriptName: SCRIPT_NAME,
                baseImageURL: "https://fold-image-api.fly.dev/images/",
                collectionName: "LESS",
                description: "a networked generative artwork about compression.",
                collectionImage: "ipfs://bafkreigozkdzx7ykenebj3flfa5qlsi3rzp77hfph4jfuhs3hsrhs5ouvi",
                externalLink: "https://less.ripe.wtf",
                owner: owner
            })
        );

        // Set renderer on Less contract
        less.setRenderer(address(renderer));

        // Enable window creation
        less.setWindowCreationEnabled(true);

        vm.stopPrank();

        // Fund test users
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        console.log("=== Setup Complete ===");
        console.log("Less NFT deployed at:", address(less));
        console.log("LessRenderer deployed at:", address(renderer));
        console.log("Strategy ($LESS ERC20):", LESS_ERC20);
        console.log("Script name:", SCRIPT_NAME);
    }

    /**
     * @notice Upload the JavaScript to ScriptyStorage
     * @dev Reads from web/onchain/bundled.js and uploads in chunks
     */
    function _uploadScriptToScripty() internal {
        console.log("=== Uploading Script to ScriptyStorage ===");
        console.log("Script path:", SCRIPT_PATH);
        console.log("Script name:", SCRIPT_NAME);

        // Read the script file
        string memory scriptContent = vm.readFile(SCRIPT_PATH);
        bytes memory scriptBytes = bytes(scriptContent);
        uint256 scriptSize = scriptBytes.length;

        console.log("Script size:", scriptSize);

        uint256 totalChunks = (scriptSize + MAX_CHUNK_SIZE - 1) / MAX_CHUNK_SIZE;
        console.log("Chunks required:", totalChunks);

        IScriptyStorage storage_ = IScriptyStorage(SCRIPTY_STORAGE_V2);

        // Create content entry (anyone can create, but we prank just in case)
        vm.prank(owner);
        try storage_.createContent(SCRIPT_NAME, "") {
            console.log("Content entry created");
        } catch {
            console.log("Content entry may already exist, continuing...");
        }

        // Upload chunks
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

            vm.prank(owner);
            storage_.addChunkToContent(SCRIPT_NAME, chunk);
            console.log("Chunk uploaded, size:", chunk.length);
        }

        // Verify upload
        bytes memory retrieved = storage_.getContent(SCRIPT_NAME, "");
        console.log("Verified upload size:", retrieved.length);
        require(retrieved.length == scriptSize, "Script upload failed");
        console.log("Script upload complete!");
        console.log("");
    }

    /**
     * @notice Impersonate $LESS ERC20 owner and set Less.sol as the authorized tokenTwapAddress
     */
    function _setLessAsTokenTwapAddress() internal {
        console.log("Setting Less.sol as tokenTwapAddress on $LESS ERC20...");
        console.log("  Impersonating owner:", LESS_ERC20_OWNER);

        vm.startPrank(LESS_ERC20_OWNER);
        IRipeStrategy(LESS_ERC20).setTokenTwapAddress(address(less));
        vm.stopPrank();

        // Verify it was set correctly
        address twapAddr = IRipeStrategy(LESS_ERC20).tokenTwapAddress();
        assertEq(twapAddr, address(less), "Less should be the tokenTwapAddress");
        console.log("  tokenTwapAddress set to:", twapAddr);
    }

    /**
     * @notice Prepare the $LESS ERC20 strategy for TWAP execution
     * @dev Sets ethToTwap storage and advances time/blocks to satisfy TWAP requirements
     */
    function _prepareStrategyForTwap(uint256 ethAmount) internal {
        console.log("Preparing strategy for TWAP with", ethAmount / 1e18, "ETH...");

        // Give strategy ETH balance (for Less.minEthForWindow check)
        vm.deal(LESS_ERC20, ethAmount);

        // Set ethToTwap storage slot directly
        vm.store(LESS_ERC20, bytes32(ETH_TO_TWAP_SLOT), bytes32(ethAmount));

        // Ensure timeUntilFundsMoved is 0 by warping past lastBurn + timeBetweenBurn
        IRecursiveStrategy strategy = IRecursiveStrategy(LESS_ERC20);
        uint256 lastBurn = strategy.lastBurn();
        uint256 timeBetweenBurn = strategy.timeBetweenBurn();
        if (block.timestamp < lastBurn + timeBetweenBurn) {
            vm.warp(lastBurn + timeBetweenBurn + 1);
        }

        // Roll forward enough blocks to satisfy twapDelayInBlocks (currently 1 block)
        // lastTwapBlock is already 0 on this contract, so any block > 1 will satisfy the delay
        vm.roll(block.number + 10);

        console.log("  Strategy ETH balance:", LESS_ERC20.balance / 1e18, "ETH");
        console.log("  ethToTwap set to:", ethAmount / 1e18, "ETH");
    }

    /**
     * @notice Test reading initial state from $LESS ERC20 contract
     */
    function test_Fork_ReadLessERC20State() public view {
        IRecursiveStrategy strategy = IRecursiveStrategy(LESS_ERC20);

        uint256 timeBetweenBurn = strategy.timeBetweenBurn();
        uint256 lastBurn = strategy.lastBurn();
        uint256 supply = strategy.totalSupply();
        address currentTwapAddress = IRipeStrategy(LESS_ERC20).tokenTwapAddress();

        console.log("=== $LESS ERC20 State ===");
        console.log("Contract:", LESS_ERC20);
        console.log("Time Between Burns:", timeBetweenBurn, "seconds");
        console.log("Last Burn Timestamp:", lastBurn);
        console.log("Total Supply:", supply / 1e18, "tokens");
        console.log("Current tokenTwapAddress:", currentTwapAddress);
        console.log("Owner:", LESS_ERC20_OWNER);
        console.log("ETH Balance:", LESS_ERC20.balance);

        // Verify we can read the contract
        assertTrue(supply > 0, "Total supply should be > 0");
    }

    /**
     * @notice Test the full end-to-end flow:
     *         1. Deploy Less.sol and renderer
     *         2. Impersonate owner to set Less.sol as tokenTwapAddress
     *         3. Call mint() which triggers createWindow() -> processTokenTwap()
     *         4. Verify tokens burned and NFT minted
     *         5. Get and display tokenURI metadata
     */
    function test_Fork_EndToEndMintFlow() public {
        console.log("");
        console.log("=== End-to-End Mint Flow Test ===");
        console.log("");

        // Step 1: Set Less.sol as the authorized tokenTwapAddress
        _setLessAsTokenTwapAddress();

        // Step 2: Prepare strategy with ETH for TWAP
        _prepareStrategyForTwap(1 ether);

        // Step 3: Record state before mint
        uint256 deadBalanceBefore = IERC20(LESS_ERC20).balanceOf(DEAD);
        console.log("");
        console.log("State before mint:");
        console.log("  Dead address $LESS balance:", deadBalanceBefore / 1e18, "tokens");
        console.log("  Less NFT totalSupply:", less.totalSupply());
        console.log("  Window count:", less.windowCount());

        // Step 4: Mint an NFT - this will auto-create a window which calls processTokenTwap
        console.log("");
        console.log("Minting NFT as Alice...");
        vm.prank(alice);
        less.mint{value: MINT_PRICE}(1);

        // Step 5: Verify results
        uint256 deadBalanceAfter = IERC20(LESS_ERC20).balanceOf(DEAD);
        uint256 tokensBurned = deadBalanceAfter - deadBalanceBefore;

        console.log("");
        console.log("State after mint:");
        console.log("  Dead address $LESS balance:", deadBalanceAfter / 1e18, "tokens");
        console.log("  Tokens burned:", tokensBurned / 1e18, "tokens");
        console.log("  Less NFT totalSupply:", less.totalSupply());
        console.log("  Window count:", less.windowCount());

        // Assertions
        assertEq(less.windowCount(), 1, "Should have created 1 window");
        assertEq(less.totalSupply(), 1, "Should have minted 1 NFT");
        assertTrue(less.isWindowActive(), "Window should be active");
        assertEq(less.ownerOf(1), alice, "Alice should own token 1");
        assertTrue(tokensBurned > 0, "Tokens should have been burned");

        // Step 6: Get token data
        Less.TokenData memory tokenData = less.getTokenData(1);
        console.log("");
        console.log("Token 1 Data:");
        console.log("  Window ID:", tokenData.windowId);
        console.log("  Seed:", vm.toString(tokenData.seed));

        // Step 7: Get and display tokenURI
        console.log("");
        console.log("=== Token URI ===");
        string memory tokenURI = less.tokenURI(1);
        assertTrue(bytes(tokenURI).length > 0, "tokenURI should not be empty");
        assertTrue(
            _startsWith(tokenURI, "data:application/json;base64,"),
            "Should be a valid data URI"
        );
        console.log("tokenURI length:", bytes(tokenURI).length, "bytes");
        console.log("");
        console.log(tokenURI);

        // Step 8: Get contractURI
        console.log("");
        console.log("=== Contract URI ===");
        string memory contractURI = less.contractURI();
        console.log(contractURI);
    }

    /**
     * @notice Test multiple mints within a single window with exponential pricing
     * @dev Tests the core buy+burn <> mint relationship with escalating prices
     */
    function test_Fork_MultipleMintsInWindow() public {
        console.log("");
        console.log("=== Multiple Mints in Single Window Test ===");

        // Set Less.sol as tokenTwapAddress
        _setLessAsTokenTwapAddress();

        // Prepare strategy and create window
        _prepareStrategyForTwap(1 ether);
        less.createWindow();
        console.log("Window created, windowCount:", less.windowCount());

        // Alice mints 3 tokens with escalating price
        console.log("");
        console.log("--- Alice's mints ---");

        // Mint 1: MINT_PRICE (1x)
        vm.prank(alice);
        less.mint{value: MINT_PRICE}(1);
        console.log("Alice mint 1 (1x):", MINT_PRICE);
        assertEq(less.getMintCount(alice), 1);

        // Mint 2: MINT_PRICE * 1.5 (1.5x)
        uint256 aliceMint2Cost = (MINT_PRICE * 3) / 2;
        vm.prank(alice);
        less.mint{value: aliceMint2Cost}(1);
        console.log("Alice mint 2 (1.5x):", aliceMint2Cost);
        assertEq(less.getMintCount(alice), 2);

        // Mint 3: MINT_PRICE * 2.25 (1.5^2)
        uint256 aliceMint3Cost = (MINT_PRICE * 9) / 4;
        vm.prank(alice);
        less.mint{value: aliceMint3Cost}(1);
        console.log("Alice mint 3 (2.25x):", aliceMint3Cost);
        assertEq(less.getMintCount(alice), 3);

        // Bob mints 2 tokens - his pricing is independent
        console.log("");
        console.log("--- Bob's mints ---");

        // Bob's first mint is base price
        vm.prank(bob);
        less.mint{value: MINT_PRICE}(1);
        console.log("Bob mint 1 (1x):", MINT_PRICE);
        assertEq(less.getMintCount(bob), 1);

        // Bob's second mint is 1.5x
        uint256 bobMint2Cost = (MINT_PRICE * 3) / 2;
        vm.prank(bob);
        less.mint{value: bobMint2Cost}(1);
        console.log("Bob mint 2 (1.5x):", bobMint2Cost);
        assertEq(less.getMintCount(bob), 2);

        // Verify final state
        console.log("");
        console.log("=== Final State ===");
        console.log("Total NFTs minted:", less.totalSupply());
        assertEq(less.totalSupply(), 5, "Should have 5 NFTs");

        // Verify next costs
        uint256 aliceNextCost = (MINT_PRICE * 27) / 8; // 3.375x for 4th mint
        assertEq(less.getMintCost(alice, 1), aliceNextCost, "Alice's next mint should be 3.375x");

        uint256 bobNextCost = (MINT_PRICE * 9) / 4; // 2.25x for 3rd mint
        assertEq(less.getMintCost(bob, 1), bobNextCost, "Bob's next mint should be 2.25x");

        // All tokens belong to window 1
        for (uint256 tokenId = 1; tokenId <= 5; tokenId++) {
            Less.TokenData memory data = less.getTokenData(tokenId);
            assertEq(data.windowId, 1, "Token should belong to window 1");
        }

        // Verify ownership
        assertEq(less.ownerOf(1), alice);
        assertEq(less.ownerOf(2), alice);
        assertEq(less.ownerOf(3), alice);
        assertEq(less.ownerOf(4), bob);
        assertEq(less.ownerOf(5), bob);

        // Output all tokenURIs
        console.log("");
        console.log("=== All Token URIs ===");
        for (uint256 i = 1; i <= 5; i++) {
            console.log("");
            console.log("--- Token", i, "---");
            Less.TokenData memory tokenData = less.getTokenData(i);
            console.log("Owner:", less.ownerOf(i));
            console.log("Window ID:", tokenData.windowId);
            console.log("Seed:", vm.toString(tokenData.seed));
            console.log("URI:");
            console.log(less.tokenURI(i));
        }
    }

    /**
     * @notice Test that processTokenTwap reverts if called by wrong address
     */
    function test_Fork_RevertWrongTwapAddress() public {
        console.log("");
        console.log("=== Wrong TWAP Address Test ===");

        // Don't set Less.sol as tokenTwapAddress (leave it as default)

        // Prepare strategy
        _prepareStrategyForTwap(1 ether);

        console.log("Current tokenTwapAddress:", IRipeStrategy(LESS_ERC20).tokenTwapAddress());
        console.log("Less.sol address:", address(less));
        console.log("Attempting to mint without being authorized...");

        // This should revert because Less.sol is not the authorized tokenTwapAddress
        vm.prank(alice);
        vm.expectRevert(); // Will revert with NotTwapWallet() from RipeStrategy
        less.mint{value: MINT_PRICE}(1);

        console.log("Correctly reverted - Less.sol is not authorized");
    }

    /**
     * @notice Test that createWindow directly works with strategy integration
     */
    function test_Fork_CreateWindowDirectly() public {
        console.log("");
        console.log("=== Direct Window Creation Test ===");

        // Set Less.sol as tokenTwapAddress
        _setLessAsTokenTwapAddress();

        // Prepare strategy
        _prepareStrategyForTwap(1 ether);

        // Verify we can create a window
        assertTrue(less.canCreateWindow(), "Should be able to create window");

        // Record state before
        uint256 deadBalanceBefore = IERC20(LESS_ERC20).balanceOf(DEAD);

        // Create window directly (not via mint)
        console.log("Creating window directly...");
        less.createWindow();

        // Verify
        assertEq(less.windowCount(), 1, "Window count should be 1");
        assertTrue(less.isWindowActive(), "Window should be active");

        uint256 deadBalanceAfter = IERC20(LESS_ERC20).balanceOf(DEAD);
        uint256 tokensBurned = deadBalanceAfter - deadBalanceBefore;
        console.log("Tokens burned:", tokensBurned / 1e18);
        assertTrue(tokensBurned > 0, "Tokens should be burned");

        // Now mint during the window
        vm.prank(alice);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.totalSupply(), 1, "Should have 1 NFT");
        assertEq(less.ownerOf(1), alice, "Alice should own token 1");

        console.log("Token 1 minted successfully");
        console.log("Token URI:");
        console.log(less.tokenURI(1));
    }

    /**
     * @notice Test exponential pricing works correctly across mints
     */
    function test_Fork_ExponentialPricing() public {
        console.log("");
        console.log("=== Exponential Pricing Test ===");

        // Set Less.sol as tokenTwapAddress
        _setLessAsTokenTwapAddress();

        // Prepare strategy
        _prepareStrategyForTwap(1 ether);

        // Create window
        less.createWindow();

        console.log("Mint prices for Alice:");

        // Mint 1 - base price
        uint256 cost1 = less.getMintCost(alice, 1);
        console.log("  Mint 1:", cost1 / 1e15, "finney");
        assertEq(cost1, MINT_PRICE, "First mint should be base price");
        vm.prank(alice);
        less.mint{value: cost1}(1);

        // Mint 2 - 1.5x base price
        uint256 cost2 = less.getMintCost(alice, 1);
        console.log("  Mint 2:", cost2 / 1e15, "finney");
        assertEq(cost2, (MINT_PRICE * 3) / 2, "Second mint should be 1.5x");
        vm.prank(alice);
        less.mint{value: cost2}(1);

        // Mint 3 - 2.25x base price (1.5^2)
        uint256 cost3 = less.getMintCost(alice, 1);
        console.log("  Mint 3:", cost3 / 1e15, "finney");
        assertEq(cost3, (MINT_PRICE * 9) / 4, "Third mint should be 2.25x");
        vm.prank(alice);
        less.mint{value: cost3}(1);

        // Next mint would be 3.375x (1.5^3)
        uint256 cost4 = less.getMintCost(alice, 1);
        console.log("  Mint 4 (not minting):", cost4 / 1e15, "finney");
        assertEq(cost4, (MINT_PRICE * 27) / 8, "Fourth mint should be 3.375x");

        // Verify Alice has 3 tokens
        assertEq(less.totalSupply(), 3, "Should have 3 NFTs");
        assertEq(less.getMintCount(alice), 3, "Alice should have 3 mints");

        // Bob's first mint should still be base price
        assertEq(less.getMintCost(bob, 1), MINT_PRICE, "Bob's first mint should be base price");

        // Output all tokenURIs
        console.log("");
        console.log("=== All Token URIs ===");
        for (uint256 i = 1; i <= 3; i++) {
            console.log("");
            console.log("--- Token", i, "---");
            Less.TokenData memory data = less.getTokenData(i);
            console.log("Owner:", less.ownerOf(i));
            console.log("Seed:", vm.toString(data.seed));
            console.log("URI:");
            console.log(less.tokenURI(i));
        }
    }

    /**
     * @notice Comprehensive metadata test - mints and retrieves full metadata
     */
    function test_Fork_FullMetadataOutput() public {
        console.log("");
        console.log("=== Full Metadata Output Test ===");

        // Set Less.sol as tokenTwapAddress
        _setLessAsTokenTwapAddress();

        // Prepare strategy
        _prepareStrategyForTwap(1 ether);

        // Create window and mint
        less.createWindow();

        vm.prank(alice);
        less.mint{value: MINT_PRICE}(1);

        // Get all token data
        Less.TokenData memory data = less.getTokenData(1);
        bytes32 seed = less.getSeed(1);

        console.log("");
        console.log("=== Token 1 Complete Data ===");
        console.log("Owner:", less.ownerOf(1));
        console.log("Window ID:", data.windowId);
        console.log("Seed:", vm.toString(seed));
        console.log("");
        console.log("=== Token Metadata (base64 decoded) ===");

        string memory tokenURI = less.tokenURI(1);
        console.log(tokenURI);

        console.log("");
        console.log("=== Collection Metadata ===");
        string memory contractURI = less.contractURI();
        console.log(contractURI);
    }

    // Helper function to check string prefix
    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory prefixBytes = bytes(prefix);

        if (strBytes.length < prefixBytes.length) return false;

        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (strBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }
}

// Extended interface for RipeStrategy specific functions
interface IRipeStrategy {
    function setTokenTwapAddress(address _address) external;
    function tokenTwapAddress() external view returns (address);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

interface IScriptyStorage {
    function createContent(string calldata name, bytes calldata details) external;
    function addChunkToContent(string calldata name, bytes calldata chunk) external;
    function getContent(string memory name, bytes memory data) external view returns (bytes memory);
}
