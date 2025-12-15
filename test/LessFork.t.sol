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
 * @dev Run with: forge test --match-contract LessFork --fork-url $MAINNET_RPC_URL --fork-block-number 23927428 -vvv
 *      Block 23927428 is just before a known TWAP tx (0x35307d04f428ed02f5ccdb65c5873ab8591fb6e88bc5c63b9cf96bea0be7dff2)
 */
contract LessForkTest is Test {
    // Mainnet RecursiveStrategy contract
    address constant STRATEGY = 0x32F223E5c09878823934a8116f289bAE2b657B8e;

    // Storage slot for ethToTwap in RecursiveStrategy
    uint256 constant ETH_TO_TWAP_SLOT = 6;

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

    /// @notice Prepare the strategy for TWAP by setting ethToTwap and advancing time/blocks
    function _prepareStrategyForTwap(uint256 ethAmount) internal {
        // Give strategy ETH balance (for Less.canCreateFold check)
        vm.deal(STRATEGY, ethAmount);

        // Set ethToTwap storage slot directly
        vm.store(STRATEGY, bytes32(ETH_TO_TWAP_SLOT), bytes32(ethAmount));

        // Ensure timeUntilFundsMoved is 0 by warping past lastBurn + timeBetweenBurn
        IRecursiveStrategy strategy = IRecursiveStrategy(STRATEGY);
        uint256 lastBurn = strategy.lastBurn();
        uint256 timeBetweenBurn = strategy.timeBetweenBurn();
        if (block.timestamp < lastBurn + timeBetweenBurn) {
            vm.warp(lastBurn + timeBetweenBurn + 1);
        }

        // Roll forward to satisfy twapDelayInBlocks
        vm.roll(block.number + 2);
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
        uint256 minEthRequired = less.minEthForFold();
        console.log("Strategy ETH Balance:", ethBalance);
        console.log("Minimum ETH Required:", minEthRequired);
        console.log("Can Create Fold:", less.canCreateFold());

        if (ethBalance >= minEthRequired) {
            console.log("Strategy has sufficient balance for fold creation");
        } else {
            console.log("Strategy balance is below minimum threshold");
        }
    }

    /**
     * @notice Test that createFold reverts when strategy has insufficient ETH
     * @dev Uses vm.deal to drain strategy balance below minEthForFold
     */
    function test_Fork_RevertInsufficientStrategyBalance() public {
        uint256 minRequired = less.minEthForFold();
        console.log("Minimum ETH required:", minRequired);

        // Drain strategy balance to below minimum
        vm.deal(STRATEGY, minRequired - 1);
        console.log("Strategy balance set to:", STRATEGY.balance);

        // Verify canCreateFold returns false
        assertFalse(less.canCreateFold(), "canCreateFold should be false");

        // Attempt to create fold should revert
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createFold();

        console.log("Correctly reverted with InsufficientStrategyBalance");
    }

    /**
     * @notice Test that mint reverts when no window and strategy has insufficient ETH
     */
    function test_Fork_MintRevertInsufficientStrategyBalance() public {
        uint256 minRequired = less.minEthForFold();

        // Drain strategy balance
        vm.deal(STRATEGY, minRequired - 1);

        // No window active, strategy can't create fold due to low balance
        assertFalse(less.isWindowActive());
        assertFalse(less.canCreateFold());

        // Mint should revert (it tries to auto-create fold but can't)
        vm.prank(alice);
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.mint{value: MINT_PRICE}();

        console.log("Mint correctly reverted when strategy balance insufficient");
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

        // Check if strategy has minimum ETH balance required
        uint256 ethBalance = STRATEGY.balance;
        uint256 minEthRequired = less.minEthForFold();
        console.log("Strategy ETH Balance:", ethBalance);
        console.log("Minimum ETH Required:", minEthRequired);
        
        if (ethBalance < minEthRequired) {
            console.log("Strategy balance is below minimum threshold - cannot create fold");
            vm.expectRevert(Less.InsufficientStrategyBalance.selector);
            less.createFold();
            return;
        }

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
     * @notice Test full fold flow using real strategy with prepared state
     * @dev Sets up ethToTwap via vm.store to enable real processTokenTwap calls
     */
    function test_Fork_RealFoldFlow() public {
        // Create 3 folds using the real strategy
        for (uint256 i = 1; i <= 3; i++) {
            // Prepare strategy for TWAP (set ethToTwap and advance time)
            _prepareStrategyForTwap(1 ether);

            // Create fold - this calls real processTokenTwap!
            less.createFold();
            console.log("Created fold", i);

            Less.Fold memory fold = less.getFold(i);
            console.log("  Block hash:");
            console.logBytes32(fold.blockHash);
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

        // Verify all folds were created
        assertEq(less.currentFoldId(), 3, "Should have 3 folds");
        assertEq(less.totalSupply(), 6, "Should have 6 tokens");

        // Verify a token URI works
        string memory uri = less.tokenURI(1);
        assertTrue(bytes(uri).length > 0);
        console.log("Token 1 URI length:", bytes(uri).length);
    }

    /**
     * @notice Test that seeds vary across folds and tokens using real strategy
     */
    function test_Fork_SeedVariation() public {
        bytes32[] memory seeds = new bytes32[](6);
        uint256 idx = 0;

        // Create 2 folds, mint 3 tokens each
        for (uint256 fold = 1; fold <= 2; fold++) {
            // Prepare and create fold with real strategy
            _prepareStrategyForTwap(1 ether);
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
     * @notice Output token metadata for visual inspection using real strategy
     */
    function test_Fork_OutputMetadata() public {
        // Prepare and create fold with real strategy
        _prepareStrategyForTwap(1 ether);
        less.createFold();

        vm.prank(alice);
        less.mint{value: MINT_PRICE}();

        console.log("=== Token 1 Full Data ===");
        Less.TokenData memory data = less.getTokenData(1);
        Less.Fold memory fold = less.getFold(data.foldId);

        console.log("Token ID: 1");
        console.log("Fold ID:", data.foldId);
        console.log("Seed:");
        console.logBytes32(less.getSeed(1));
        console.log("Block Hash:");
        console.logBytes32(fold.blockHash);
        console.log("Window Start:", fold.startTime);
        console.log("Window End:", fold.endTime);

        // Check strategy state after real TWAP
        IRecursiveStrategy strategy = IRecursiveStrategy(STRATEGY);
        console.log("Strategy supply after burn:", strategy.totalSupply() / 1e18, "tokens");

        console.log("");
        console.log("=== Token URI ===");
        string memory uri = less.tokenURI(1);
        console.log(uri);
    }

    /**
     * @notice Verify the real processTokenTwap executes correctly
     * @dev The RecursiveStrategy burns by sending to dead address, not reducing totalSupply
     *      Success is verified by checking dead address balance increases
     */
    function test_Fork_RealProcessTokenTwap() public {
        address DEAD = 0x000000000000000000000000000000000000dEaD;

        // Check dead address balance before
        uint256 deadBalanceBefore = IERC20(STRATEGY).balanceOf(DEAD);
        console.log("Dead address balance before:", deadBalanceBefore / 1e18, "tokens");

        // Prepare strategy
        _prepareStrategyForTwap(1 ether);

        // Verify ethToTwap was set
        uint256 ethToTwap = uint256(vm.load(STRATEGY, bytes32(ETH_TO_TWAP_SLOT)));
        console.log("ethToTwap set to:", ethToTwap / 1e18, "ETH");
        assertEq(ethToTwap, 1 ether);

        // Create fold (calls real processTokenTwap)
        less.createFold();

        // Check dead address balance after
        uint256 deadBalanceAfter = IERC20(STRATEGY).balanceOf(DEAD);
        console.log("Dead address balance after:", deadBalanceAfter / 1e18, "tokens");

        // Verify tokens were actually burned (sent to dead address)
        uint256 tokensBurned = deadBalanceAfter - deadBalanceBefore;
        console.log("Tokens burned in this TWAP:", tokensBurned / 1e18);
        assertTrue(tokensBurned > 0, "Tokens should be burned to dead address");

        // Verify fold was created successfully
        assertEq(less.currentFoldId(), 1, "Fold should be created");
        assertTrue(less.isWindowActive(), "Window should be active");

        Less.Fold memory fold = less.getFold(1);
        console.log("");
        console.log("Fold created successfully!");
        console.log("Block hash:");
        console.logBytes32(fold.blockHash);
    }
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}
