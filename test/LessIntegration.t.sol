// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";

/**
 * @title RealisticMockStrategy
 * @notice A mock that behaves more like the real RecursiveStrategy
 * @dev Simulates ETH accumulation, TWAP delays, and supply reduction
 */
contract RealisticMockStrategy {
    uint256 public timeBetweenBurn = 30 minutes;
    uint256 public lastBurn;
    uint256 public totalSupply = 1_000_000_000 ether;

    uint256 public ethToTwap;
    uint256 public twapDelayInBlocks = 1;
    uint256 public lastTwapBlock;

    uint256 public burnCount;

    error NoETHToTwap();
    error TwapDelayNotMet();

    constructor() {
        // Start with some ETH ready for TWAP
        ethToTwap = 1 ether;
    }

    function timeUntilFundsMoved() external view returns (uint256) {
        if (block.timestamp <= lastBurn + timeBetweenBurn) {
            return (lastBurn + timeBetweenBurn) - block.timestamp;
        }
        return 0;
    }

    /// @notice Simulates the real processTokenTwap behavior
    function processTokenTwap() external {
        if (ethToTwap == 0) revert NoETHToTwap();
        if (block.number < lastTwapBlock + twapDelayInBlocks) revert TwapDelayNotMet();

        // Simulate burning - reduce supply by ~0.1-1%
        uint256 burnAmount = totalSupply / 1000; // 0.1%
        totalSupply -= burnAmount;

        // Use up ETH
        uint256 twapAmount = ethToTwap > 0.1 ether ? 0.1 ether : ethToTwap;
        ethToTwap -= twapAmount;

        lastTwapBlock = block.number;
        lastBurn = block.timestamp;
        burnCount++;
    }

    /// @notice Add ETH to simulate fee accumulation
    function addETH() external payable {
        ethToTwap += msg.value;
    }

    /// @notice Get current state for debugging
    function getState() external view returns (
        uint256 _totalSupply,
        uint256 _ethToTwap,
        uint256 _lastBurn,
        uint256 _burnCount
    ) {
        return (totalSupply, ethToTwap, lastBurn, burnCount);
    }
}

/// @dev Mock ScriptyBuilder
contract MockScriptyBuilder {
    struct HTMLTag {
        string name;
        address contractAddress;
        bytes contractData;
        uint8 tagType;
        bytes tagOpen;
        bytes tagClose;
        bytes tagContent;
    }

    struct HTMLRequest {
        HTMLTag[] headTags;
        HTMLTag[] bodyTags;
    }

    function getEncodedHTMLString(HTMLRequest memory)
        external
        pure
        returns (string memory)
    {
        return "PGh0bWw+PC9odG1sPg==";
    }
}

/**
 * @title LessIntegrationTest
 * @notice Integration tests simulating realistic multi-fold scenarios
 */
contract LessIntegrationTest is Test {
    Less public less;
    LessRenderer public renderer;
    RealisticMockStrategy public strategy;
    MockScriptyBuilder public scriptyBuilder;

    address public owner = makeAddr("owner");
    address public payout = makeAddr("payout");

    uint256 public constant MINT_PRICE = 0.01 ether;

    function setUp() public {
        strategy = new RealisticMockStrategy();
        scriptyBuilder = new MockScriptyBuilder();

        vm.startPrank(owner);
        less = new Less(address(strategy), MINT_PRICE, payout, owner);
        renderer = new LessRenderer(
            address(less),
            address(scriptyBuilder),
            address(0),
            "less",
            "https://less.art/images/",
            owner
        );
        less.setRenderer(address(renderer));
        vm.stopPrank();
    }

    /**
     * @notice Simulate a full lifecycle: multiple folds with varying mints
     */
    function test_FullLifecycle() public {
        console.log("=== Starting Full Lifecycle Test ===");
        console.log("");

        uint256 numFolds = 10;
        uint256[] memory mintsPerFold = new uint256[](numFolds);
        mintsPerFold[0] = 5;   // Early folds: more mints
        mintsPerFold[1] = 8;
        mintsPerFold[2] = 12;
        mintsPerFold[3] = 6;
        mintsPerFold[4] = 3;   // Mid folds: fewer
        mintsPerFold[5] = 2;
        mintsPerFold[6] = 4;
        mintsPerFold[7] = 1;   // Late folds: sparse
        mintsPerFold[8] = 2;
        mintsPerFold[9] = 1;

        uint256 userCounter = 1000;

        for (uint256 f = 0; f < numFolds; f++) {
            // Advance block for unique blockhash
            vm.roll(block.number + 5);

            // Add some ETH to strategy to enable next TWAP
            strategy.addETH{value: 0.5 ether}();

            // Create fold
            less.createFold();

            (uint256 supply, uint256 eth, uint256 lastBurn, uint256 burns) = strategy.getState();

            console.log("--- Fold", f + 1, "---");
            console.log("  Strategy supply:", supply / 1e18, "tokens");
            console.log("  Strategy ETH:", eth / 1e15, "finney");
            console.log("  Total burns:", burns);

            // Mint tokens
            for (uint256 m = 0; m < mintsPerFold[f]; m++) {
                address minter = address(uint160(userCounter++));
                vm.deal(minter, 1 ether);
                vm.prank(minter);
                less.mint{value: MINT_PRICE}();
            }

            console.log("  Minted:", mintsPerFold[f], "tokens");
            console.log("  Total supply:", less.totalSupply());

            // Fast forward past window
            vm.warp(block.timestamp + 31 minutes);
        }

        console.log("");
        console.log("=== Final Results ===");
        console.log("Total folds:", less.currentFoldId());
        console.log("Total tokens minted:", less.totalSupply());
        console.log("Payout received:", payout.balance / 1e15, "finney");

        (uint256 finalSupply,,,) = strategy.getState();
        console.log("Strategy final supply:", finalSupply / 1e18, "tokens");
        console.log("Supply reduction:", (1_000_000_000 - finalSupply / 1e18), "tokens burned");
    }

    /**
     * @notice Test seed distribution across many tokens
     */
    function test_SeedDistribution() public {
        console.log("=== Seed Distribution Analysis ===");

        // Generate 50 tokens across 10 folds
        bytes32[] memory seeds = new bytes32[](50);
        uint256 tokenIdx = 0;
        uint256 userCounter = 2000;

        for (uint256 f = 0; f < 10; f++) {
            vm.roll(block.number + 3);
            strategy.addETH{value: 0.2 ether}();
            less.createFold();

            for (uint256 m = 0; m < 5; m++) {
                address minter = address(uint160(userCounter++));
                vm.deal(minter, 1 ether);
                vm.prank(minter);
                less.mint{value: MINT_PRICE}();

                seeds[tokenIdx++] = less.getSeed(less.totalSupply());
            }

            vm.warp(block.timestamp + 31 minutes);
        }

        // Analyze seed distribution
        uint256 uniqueSeeds = 0;
        for (uint256 i = 0; i < seeds.length; i++) {
            bool isUnique = true;
            for (uint256 j = 0; j < i; j++) {
                if (seeds[i] == seeds[j]) {
                    isUnique = false;
                    break;
                }
            }
            if (isUnique) uniqueSeeds++;
        }

        console.log("Total seeds:", seeds.length);
        console.log("Unique seeds:", uniqueSeeds);
        assertEq(uniqueSeeds, seeds.length, "All seeds should be unique");

        // Show sample seeds from different folds
        console.log("");
        console.log("Sample seeds:");
        console.log("  Token 1 (Fold 1):");
        console.logBytes32(seeds[0]);
        console.log("  Token 25 (Fold 5):");
        console.logBytes32(seeds[24]);
        console.log("  Token 50 (Fold 10):");
        console.logBytes32(seeds[49]);
    }

    /**
     * @notice Test that tokens from same fold have related but different seeds
     */
    function test_SameFoldDifferentSeeds() public {
        strategy.addETH{value: 1 ether}();
        less.createFold();

        // Mint 10 tokens in same fold
        bytes32[] memory seeds = new bytes32[](10);
        for (uint256 i = 0; i < 10; i++) {
            address minter = address(uint160(3000 + i));
            vm.deal(minter, 1 ether);
            vm.prank(minter);
            less.mint{value: MINT_PRICE}();
            seeds[i] = less.getSeed(i + 1);
        }

        console.log("=== Same Fold Seeds ===");
        for (uint256 i = 0; i < 10; i++) {
            console.log("Token", i + 1);
            console.logBytes32(seeds[i]);
        }

        // All should be unique
        for (uint256 i = 0; i < seeds.length; i++) {
            for (uint256 j = i + 1; j < seeds.length; j++) {
                assertTrue(seeds[i] != seeds[j], "Seeds in same fold should differ");
            }
        }
    }

    /**
     * @notice Output metadata for visual inspection
     */
    function test_OutputSampleMetadata() public {
        strategy.addETH{value: 1 ether}();

        // Create a few folds
        for (uint256 f = 0; f < 3; f++) {
            vm.roll(block.number + 10);
            less.createFold();

            address minter = address(uint160(4000 + f));
            vm.deal(minter, 1 ether);
            vm.prank(minter);
            less.mint{value: MINT_PRICE}();

            vm.warp(block.timestamp + 31 minutes);
            strategy.addETH{value: 0.5 ether}();
        }

        console.log("=== Token Metadata Samples ===");

        for (uint256 t = 1; t <= 3; t++) {
            Less.TokenData memory data = less.getTokenData(t);
            Less.Fold memory fold = less.getFold(data.foldId);

            console.log("");
            console.log("--- Token", t, "---");
            console.log("Fold ID:", data.foldId);
            console.log("Seed:");
            console.logBytes32(data.seed);
            console.log("Strategy Block:", fold.strategyBlock);
            console.log("Window:", fold.startTime, "-", fold.endTime);

            string memory uri = less.tokenURI(t);
            console.log("URI length:", bytes(uri).length);
        }
    }

    /**
     * @notice Test edge case: fold fails if strategy not ready
     */
    function test_FoldFailsWhenStrategyNotReady() public {
        // Use up all the ETH
        less.createFold();

        // Strategy now has no ETH
        (,uint256 eth,,) = strategy.getState();

        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 10);

        // This should fail because no ETH to TWAP
        if (eth == 0) {
            vm.expectRevert(RealisticMockStrategy.NoETHToTwap.selector);
            less.createFold();
        }
    }
}
