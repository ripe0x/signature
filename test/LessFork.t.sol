// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";
import {IRecursiveStrategy} from "../contracts/IRecursiveStrategy.sol";

/// @dev Mock ScriptyBuilder for fork tests
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
 * @title LessForkTest
 * @notice Fork tests against a real RecursiveStrategy on mainnet
 * @dev Run with: forge test --match-contract LessFork --fork-url $MAINNET_RPC_URL --fork-block-number 23926833 -vvv
 */
contract LessForkTest is Test {
    // Mainnet RecursiveStrategy contract
    address constant STRATEGY = 0x32F223E5c09878823934a8116f289bAE2b657B8e;

    Less public less;
    LessRenderer public renderer;
    MockScriptyBuilder public scriptyBuilder;

    address public owner = makeAddr("owner");
    address public payout = makeAddr("payout");

    // Test users
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 public constant MINT_PRICE = 0.01 ether;

    function setUp() public {
        // Verify we're on a fork
        require(block.chainid == 1, "Must run on mainnet fork");

        scriptyBuilder = new MockScriptyBuilder();

        vm.startPrank(owner);

        // Deploy Less pointing to the real strategy
        less = new Less(STRATEGY, MINT_PRICE, payout, owner);

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

        // Fund test users
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_Fork_ReadStrategyData() public view {
        IRecursiveStrategy strategy = IRecursiveStrategy(STRATEGY);

        uint256 timeBetweenBurn = strategy.timeBetweenBurn();
        uint256 lastBurn = strategy.lastBurn();
        uint256 supply = strategy.totalSupply();

        console.log("=== Strategy State at Fork Block ===");
        console.log("Time Between Burns:", timeBetweenBurn);
        console.log("Last Burn Timestamp:", lastBurn);
        console.log("Total Supply:", supply / 1e18, "tokens");
        console.log("Window Duration in Less:", less.windowDuration());

        assertEq(less.windowDuration(), timeBetweenBurn);
    }

    function test_Fork_StrategyHasETH() public view {
        uint256 ethBalance = STRATEGY.balance;
        console.log("Strategy ETH Balance:", ethBalance);
    }

    /**
     * @notice Test creating a fold with the real strategy
     * @dev This will likely fail unless the strategy is ready for a TWAP
     *      The test shows what happens when you try to call processTokenTwap
     */
    function test_Fork_CreateFold_RequiresStrategyReady() public {
        IRecursiveStrategy strategy = IRecursiveStrategy(STRATEGY);

        uint256 timeUntil = strategy.timeUntilFundsMoved();
        console.log("Time until funds moved:", timeUntil);

        // If there's ETH to TWAP and enough time has passed, this might work
        // Otherwise it will revert with NoETHToTwap or TwapDelayNotMet

        // Skip time to make TWAP available
        if (timeUntil > 0) {
            vm.warp(block.timestamp + timeUntil + 1);
        }

        // Try to create a fold - this calls processTokenTwap on the strategy
        // It may still fail if there's no ETH in ethToTwap
        try less.createFold() {
            console.log("Fold created successfully!");
            assertEq(less.currentFoldId(), 1);
            assertTrue(less.isWindowActive());
        } catch Error(string memory reason) {
            console.log("createFold reverted:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("createFold reverted with low-level error");
            console.logBytes(lowLevelData);
        }
    }

    /**
     * @notice Simulate what would happen if we could trigger burns
     * @dev Uses vm.mockCall to simulate successful processTokenTwap
     */
    function test_Fork_SimulatedFoldFlow() public {
        // Mock processTokenTwap to always succeed
        vm.mockCall(
            STRATEGY,
            abi.encodeWithSignature("processTokenTwap()"),
            abi.encode()
        );

        // Now create folds
        for (uint256 i = 1; i <= 3; i++) {
            less.createFold();
            console.log("Created fold", i);

            Less.Fold memory fold = less.getFold(i);
            console.log("  Strategy Block:", fold.strategyBlock);
            console.log("  Window ends:", fold.endTime);

            // Mint some tokens
            vm.prank(alice);
            less.mint{value: MINT_PRICE}();

            vm.prank(bob);
            less.mint{value: MINT_PRICE}();

            uint256 lastToken = less.totalSupply();
            console.log("  Tokens minted:", lastToken);
            console.log("  Last seed:", vm.toString(less.getSeed(lastToken)));

            // Fast forward past window
            vm.warp(block.timestamp + less.windowDuration() + 1);
        }

        // Check final state
        console.log("");
        console.log("=== Final State ===");
        console.log("Total folds:", less.currentFoldId());
        console.log("Total tokens:", less.totalSupply());
        console.log("Payout balance:", payout.balance);

        // Verify a token URI works
        string memory uri = less.tokenURI(1);
        assertTrue(bytes(uri).length > 0);
        console.log("Token 1 URI length:", bytes(uri).length);
    }

    /**
     * @notice Test that seeds vary across folds and tokens
     */
    function test_Fork_SeedVariation() public {
        // Mock processTokenTwap
        vm.mockCall(
            STRATEGY,
            abi.encodeWithSignature("processTokenTwap()"),
            abi.encode()
        );

        bytes32[] memory seeds = new bytes32[](6);
        uint256 idx = 0;

        // Create 2 folds, mint 3 tokens each
        for (uint256 fold = 1; fold <= 2; fold++) {
            vm.roll(block.number + 10); // Different blocks for different blockhashes
            less.createFold();

            for (uint256 m = 0; m < 3; m++) {
                address minter = address(uint160(1000 + fold * 10 + m));
                vm.deal(minter, 1 ether);
                vm.prank(minter);
                less.mint{value: MINT_PRICE}();

                seeds[idx++] = less.getSeed(less.totalSupply());
            }

            vm.warp(block.timestamp + less.windowDuration() + 1);
        }

        console.log("=== Seed Comparison ===");
        for (uint256 i = 0; i < seeds.length; i++) {
            console.log("Token", i + 1, "seed:");
            console.logBytes32(seeds[i]);
        }

        // Verify all seeds are unique
        for (uint256 i = 0; i < seeds.length; i++) {
            for (uint256 j = i + 1; j < seeds.length; j++) {
                assertTrue(seeds[i] != seeds[j], "Seeds should be unique");
            }
        }
    }

    /**
     * @notice Output token metadata for visual inspection
     */
    function test_Fork_OutputMetadata() public {
        vm.mockCall(
            STRATEGY,
            abi.encodeWithSignature("processTokenTwap()"),
            abi.encode()
        );

        less.createFold();

        vm.prank(alice);
        less.mint{value: MINT_PRICE}();

        console.log("=== Token 1 Full Data ===");
        Less.TokenData memory data = less.getTokenData(1);
        Less.Fold memory fold = less.getFold(data.foldId);

        console.log("Token ID: 1");
        console.log("Fold ID:", data.foldId);
        console.logBytes32(data.seed);
        console.log("Strategy Block:", fold.strategyBlock);
        console.log("Window Start:", fold.startTime);
        console.log("Window End:", fold.endTime);

        console.log("");
        console.log("=== Token URI ===");
        string memory uri = less.tokenURI(1);
        console.log(uri);
    }
}
