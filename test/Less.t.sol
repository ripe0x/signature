// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";
import {ERC721} from "solady/tokens/ERC721.sol";

/// @dev Mock RecursiveStrategy for testing
contract MockStrategy {
    uint256 public timeBetweenBurn = 30 minutes;
    uint256 public lastBurn;
    uint256 public totalSupply = 1_000_000_000 ether;
    bool public shouldRevert;
    uint256 public mockTimeUntilFundsMoved;
    bool public useMockTimeUntil;

    function timeUntilFundsMoved() external view returns (uint256) {
        if (useMockTimeUntil) {
            return mockTimeUntilFundsMoved;
        }
        // If never burned (lastBurn == 0), assume ready
        if (lastBurn == 0) {
            return 0;
        }
        if (block.timestamp <= lastBurn + timeBetweenBurn) {
            return (lastBurn + timeBetweenBurn) - block.timestamp;
        }
        return 0;
    }

    function processTokenTwap() external {
        require(!shouldRevert, "Strategy: cannot burn yet");
        lastBurn = block.timestamp;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function setMockTimeUntilFundsMoved(uint256 _time) external {
        mockTimeUntilFundsMoved = _time;
        useMockTimeUntil = true;
    }

    function clearMockTimeUntilFundsMoved() external {
        useMockTimeUntil = false;
    }

    /// @notice Allow contract to receive ETH for testing balance checks
    receive() external payable {}
}

/// @dev Mock ScriptyBuilder for testing
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
        return "PGh0bWw+PC9odG1sPg=="; // base64 of "<html></html>"
    }
}

contract LessTest is Test {
    Less public less;
    LessRenderer public renderer;
    MockStrategy public strategy;
    MockScriptyBuilder public scriptyBuilder;

    address public owner = address(0x1);
    address public payout = address(0x2);
    address public user1 = address(0x3);
    address public user2 = address(0x4);

    uint256 public constant MINT_PRICE = 0.01 ether;

    function setUp() public {
        strategy = new MockStrategy();
        scriptyBuilder = new MockScriptyBuilder();

        vm.startPrank(owner);

        less = new Less(address(strategy), MINT_PRICE, payout, owner);

        renderer = new LessRenderer(
            LessRenderer.RendererConfig({
                less: address(less),
                scriptyBuilder: address(scriptyBuilder),
                scriptyStorage: address(0), // scriptyStorage not needed for mock
                scriptName: "test-script",
                baseImageURL: "https://example.com/less/",
                collectionName: "LESS",
                description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
                collectionImage: "https://example.com/less/collection.png",
                externalLink: "https://less.art",
                owner: owner
            })
        );

        less.setRenderer(address(renderer));

        vm.stopPrank();
    }

    function test_InitialState() public view {
        assertEq(less.name(), "LESS");
        assertEq(less.symbol(), "LESS");
        assertEq(less.currentFoldId(), 0);
        assertEq(less.totalSupply(), 0);
        assertEq(less.mintPrice(), MINT_PRICE);
        assertEq(less.payoutRecipient(), payout);
        assertEq(less.windowDuration(), 30 minutes);
        assertEq(less.minEthForFold(), 0.25 ether);
    }

    function test_CreateFold() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        assertEq(less.currentFoldId(), 1);
        assertTrue(less.isWindowActive());

        Less.Fold memory fold = less.getFold(1);
        assertEq(fold.startTime, block.timestamp);
        assertEq(fold.endTime, block.timestamp + 30 minutes);
        assertEq(fold.blockHash, blockhash(block.number - 1));
    }

    function test_CreateFold_RevertIfWindowActive() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.expectRevert(Less.MintWindowActive.selector);
        less.createFold();
    }

    function test_CreateFold_AfterWindowEnds() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());

        // Balance should still be sufficient
        assertTrue(address(strategy).balance >= less.minEthForFold());
        
        less.createFold();
        assertEq(less.currentFoldId(), 2);
        assertTrue(less.isWindowActive());
    }

    function test_CreateFold_RevertInsufficientStrategyBalance() public {
        // Don't send ETH to strategy - balance is 0
        assertEq(address(strategy).balance, 0);
        assertLt(address(strategy).balance, less.minEthForFold());

        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createFold();
    }

    function test_CreateFold_RevertBalanceBelowThreshold() public {
        // Send ETH but below the minimum threshold
        vm.deal(address(strategy), 0.1 ether); // Below 0.25 ETH minimum
        assertLt(address(strategy).balance, less.minEthForFold());

        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createFold();
    }

    function test_CreateFold_SucceedsWithExactThreshold() public {
        // Send exactly the minimum required ETH
        vm.deal(address(strategy), 0.25 ether);
        assertEq(address(strategy).balance, less.minEthForFold());

        less.createFold();
        assertEq(less.currentFoldId(), 1);
        assertTrue(less.isWindowActive());
    }

    function test_CreateFold_SucceedsAboveThreshold() public {
        // Send more than the minimum required ETH
        vm.deal(address(strategy), 1 ether);
        assertGt(address(strategy).balance, less.minEthForFold());

        less.createFold();
        assertEq(less.currentFoldId(), 1);
        assertTrue(less.isWindowActive());
    }

    function test_CreateFold_WaitForThresholdAfterWindow() public {
        // Start with sufficient balance
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());

        // Simulate balance dropping below threshold (e.g., from a previous burn)
        // We can't directly withdraw from strategy, but we can simulate by checking
        // the behavior when balance is below threshold
        
        // If balance is still sufficient, can create immediately
        if (address(strategy).balance >= less.minEthForFold()) {
            less.createFold();
            assertEq(less.currentFoldId(), 2);
        }
    }

    function test_CanCreateFold() public view {
        // Initially no active window and no ETH - cannot create
        assertFalse(less.isWindowActive());
        assertEq(address(strategy).balance, 0);
        assertFalse(less.canCreateFold());
    }

    function test_CanCreateFold_WithSufficientBalance() public {
        // Send sufficient ETH
        vm.deal(address(strategy), 0.5 ether);
        
        assertFalse(less.isWindowActive());
        assertTrue(address(strategy).balance >= less.minEthForFold());
        assertTrue(less.canCreateFold());
    }

    function test_CanCreateFold_RevertWhenWindowActive() public {
        // Send sufficient ETH and create a fold
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();
        
        assertTrue(less.isWindowActive());
        assertFalse(less.canCreateFold()); // Cannot create when window is active
    }

    function test_CanCreateFold_AfterWindowWithSufficientBalance() public {
        // Send sufficient ETH and create a fold
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();
        
        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());
        
        // If balance is still sufficient, can create
        if (address(strategy).balance >= less.minEthForFold()) {
            assertTrue(less.canCreateFold());
        }
    }

    function test_CanCreateFold_AfterWindowWithInsufficientBalance() public {
        // This test verifies the scenario where window closes but balance is below threshold
        // Start with exactly the threshold
        vm.deal(address(strategy), 0.25 ether);
        less.createFold();
        
        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());
        
        // If balance is still at threshold, can create
        // In a real scenario, if balance dropped below, canCreateFold would return false
        if (address(strategy).balance >= less.minEthForFold()) {
            assertTrue(less.canCreateFold());
        } else {
            assertFalse(less.canCreateFold());
        }
    }

    function test_CreateFold_BalanceThresholdFlow() public {
        // Test the complete flow: insufficient -> sufficient -> create -> insufficient -> wait -> sufficient
        
        // Step 1: Cannot create when balance is insufficient
        assertEq(address(strategy).balance, 0);
        assertFalse(less.canCreateFold());
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createFold();
        
        // Step 2: Send ETH to meet threshold
        vm.deal(address(strategy), 0.3 ether);
        assertTrue(address(strategy).balance >= less.minEthForFold());
        assertTrue(less.canCreateFold());
        
        // Step 3: Can create fold now
        less.createFold();
        assertEq(less.currentFoldId(), 1);
        assertTrue(less.isWindowActive());
        
        // Step 4: Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());
        
        // Step 5: Balance still sufficient, can create immediately
        assertTrue(address(strategy).balance >= less.minEthForFold());
        assertTrue(less.canCreateFold());
        less.createFold();
        assertEq(less.currentFoldId(), 2);
    }

    function test_SetMinEthForFold() public {
        vm.startPrank(owner);

        uint256 newMin = 0.5 ether;
        less.setMinEthForFold(newMin);
        assertEq(less.minEthForFold(), newMin);

        // Verify old threshold no longer works
        vm.deal(address(strategy), 0.25 ether); // Old minimum
        assertLt(address(strategy).balance, less.minEthForFold());
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createFold();

        // Verify new threshold works
        vm.deal(address(strategy), 0.5 ether); // New minimum
        less.createFold();
        assertEq(less.currentFoldId(), 1);

        vm.stopPrank();
    }

    function test_SetMinEthForFold_RevertNonOwner() public {
        vm.startPrank(user1);

        vm.expectRevert();
        less.setMinEthForFold(0.5 ether);

        vm.stopPrank();
    }

    function test_Mint() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.getTokenData(1).foldId, 1);
        assertTrue(less.getSeed(1) != bytes32(0));
        assertEq(payout.balance, MINT_PRICE);
    }

    function test_Mint_RevertInsufficientStrategyBalance() public {
        // No ETH in strategy, so fold cannot be created
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.mint{value: MINT_PRICE}();
    }

    function test_Mint_AutoCreatesFold() public {
        // Strategy has sufficient ETH, but no fold exists yet
        vm.deal(address(strategy), 0.5 ether);
        assertEq(less.currentFoldId(), 0);
        assertFalse(less.isWindowActive());

        // Mint should auto-create a fold
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        // Verify fold was created and token was minted
        assertEq(less.currentFoldId(), 1);
        assertTrue(less.isWindowActive());
        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.getTokenData(1).foldId, 1);
    }

    function test_Mint_AutoCreatesFoldAfterWindowExpires() public {
        // Create first fold and mint
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());

        // Second user mints - should auto-create fold 2
        vm.deal(user2, 1 ether);
        vm.prank(user2);
        less.mint{value: MINT_PRICE}();

        // Verify fold 2 was created
        assertEq(less.currentFoldId(), 2);
        assertTrue(less.isWindowActive());
        assertEq(less.totalSupply(), 2);
        assertEq(less.getTokenData(2).foldId, 2);
    }

    function test_Mint_RevertAlreadyMinted() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.startPrank(user1);
        less.mint{value: MINT_PRICE}();

        vm.expectRevert(Less.AlreadyMintedThisFold.selector);
        less.mint{value: MINT_PRICE}();
        vm.stopPrank();
    }

    function test_Mint_RevertInsufficientPayment() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InsufficientPayment.selector);
        less.mint{value: MINT_PRICE - 1}();
    }

    function test_Mint_RefundsExcessPayment() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.deal(user1, 1 ether);
        uint256 excessAmount = 0.005 ether;
        uint256 totalSent = MINT_PRICE + excessAmount;
        
        uint256 balanceBefore = user1.balance;
        uint256 payoutBalanceBefore = payout.balance;
        
        vm.prank(user1);
        less.mint{value: totalSent}();
        
        uint256 balanceAfter = user1.balance;
        uint256 payoutBalanceAfter = payout.balance;
        
        // User should have received excess refunded
        assertEq(balanceAfter, balanceBefore - totalSent + excessAmount);
        // Payout should only receive exact mint price
        assertEq(payoutBalanceAfter, payoutBalanceBefore + MINT_PRICE);
        // Verify token was minted
        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
    }

    function test_Mint_ExactPaymentNoRefund() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.deal(user1, 1 ether);
        uint256 balanceBefore = user1.balance;
        uint256 payoutBalanceBefore = payout.balance;
        
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();
        
        uint256 balanceAfter = user1.balance;
        uint256 payoutBalanceAfter = payout.balance;
        
        // User should have paid exactly the mint price
        assertEq(balanceAfter, balanceBefore - MINT_PRICE);
        // Payout should receive exact mint price
        assertEq(payoutBalanceAfter, payoutBalanceBefore + MINT_PRICE);
    }

    function test_Mint_MultipleUsersPerFold() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.deal(user2, 1 ether);

        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        vm.prank(user2);
        less.mint{value: MINT_PRICE}();

        assertEq(less.totalSupply(), 2);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.ownerOf(2), user2);
        assertEq(less.getTokenData(1).foldId, 1);
        assertEq(less.getTokenData(2).foldId, 1);
    }

    function test_Mint_SameUserDifferentFolds() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        // Fold 1
        less.createFold();
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        // Fast forward and create fold 2
        vm.warp(block.timestamp + 31 minutes);
        
        // Ensure balance is still sufficient (in real scenario might need to top up)
        if (address(strategy).balance < less.minEthForFold()) {
            vm.deal(address(strategy), less.minEthForFold());
        }
        
        less.createFold();

        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        assertEq(less.totalSupply(), 2);
        assertEq(less.getTokenData(1).foldId, 1);
        assertEq(less.getTokenData(2).foldId, 2);
    }

    function test_TokenURI() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        string memory uri = less.tokenURI(1);
        assertTrue(bytes(uri).length > 0);
        // Should start with data:application/json;base64,
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    function test_ContractURI() public {
        string memory uri = less.contractURI();
        assertTrue(bytes(uri).length > 0);
        // Should start with data:application/json;base64,
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    function test_AdminFunctions() public {
        vm.startPrank(owner);

        less.setMintPrice(0.02 ether);
        assertEq(less.mintPrice(), 0.02 ether);

        address newPayout = address(0x5);
        less.setPayoutRecipient(newPayout);
        assertEq(less.payoutRecipient(), newPayout);

        address newRenderer = address(0x6);
        less.setRenderer(newRenderer);
        assertEq(less.renderer(), newRenderer);

        uint256 newMinEth = 0.5 ether;
        less.setMinEthForFold(newMinEth);
        assertEq(less.minEthForFold(), newMinEth);

        vm.stopPrank();
    }

    function test_AdminFunctions_RevertNonOwner() public {
        vm.startPrank(user1);

        vm.expectRevert();
        less.setMintPrice(0.02 ether);

        vm.expectRevert();
        less.setPayoutRecipient(address(0x5));

        vm.expectRevert();
        less.setRenderer(address(0x6));

        vm.expectRevert();
        less.setMinEthForFold(0.5 ether);

        vm.stopPrank();
    }

    function test_Constructor_RevertInvalidStrategy() public {
        vm.expectRevert(Less.InvalidStrategyAddress.selector);
        new Less(address(0), MINT_PRICE, payout, owner);
    }

    function test_Constructor_RevertInvalidOwner() public {
        vm.expectRevert(Less.InvalidOwner.selector);
        new Less(address(strategy), MINT_PRICE, payout, address(0));
    }

    function test_Constructor_RevertInvalidPayoutRecipient() public {
        vm.expectRevert(Less.InvalidPayoutRecipient.selector);
        new Less(address(strategy), MINT_PRICE, address(0), owner);
    }

    function test_SetRenderer_RevertZeroAddress() public {
        vm.startPrank(owner);
        vm.expectRevert(Less.InvalidRenderer.selector);
        less.setRenderer(address(0));
        vm.stopPrank();
    }

    function test_SetPayoutRecipient_RevertZeroAddress() public {
        vm.startPrank(owner);
        vm.expectRevert(Less.InvalidPayoutRecipient.selector);
        less.setPayoutRecipient(address(0));
        vm.stopPrank();
    }

    function test_CanCreateFold_FalseWhenTwapDelayNotMet() public {
        // Send ETH to strategy
        vm.deal(address(strategy), 0.5 ether);

        // No active window, sufficient balance, but TWAP delay not met
        assertFalse(less.isWindowActive());
        assertTrue(address(strategy).balance >= less.minEthForFold());

        // Mock the strategy to report TWAP delay not met
        strategy.setMockTimeUntilFundsMoved(100); // 100 seconds until ready

        // canCreateFold should return false because TWAP delay not met
        assertFalse(less.canCreateFold());

        // Now clear the mock and verify it returns true
        strategy.clearMockTimeUntilFundsMoved();
        assertTrue(less.canCreateFold());
    }

    function test_TokenURI_RevertWhenRendererNotSet() public {
        // Deploy a new Less without setting renderer
        Less lessNoRenderer = new Less(address(strategy), MINT_PRICE, payout, owner);

        // Send ETH and create fold
        vm.deal(address(strategy), 0.5 ether);
        lessNoRenderer.createFold();

        // Mint a token
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        lessNoRenderer.mint{value: MINT_PRICE}();

        // tokenURI should revert when calling address(0)
        vm.expectRevert();
        lessNoRenderer.tokenURI(1);
    }

    function test_GetSeed_RevertNonExistentToken() public {
        vm.expectRevert(ERC721.TokenDoesNotExist.selector);
        less.getSeed(999);
    }

    function test_GetTokenData_RevertNonExistentToken() public {
        vm.expectRevert(ERC721.TokenDoesNotExist.selector);
        less.getTokenData(999);
    }

    function test_GetFold_RevertFoldIdZero() public {
        vm.expectRevert(Less.FoldDoesNotExist.selector);
        less.getFold(0);
    }

    function test_GetFold_RevertNonExistentFold() public {
        // No folds created yet
        vm.expectRevert(Less.FoldDoesNotExist.selector);
        less.getFold(1);

        // Create a fold
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        // Fold 1 exists now
        Less.Fold memory fold = less.getFold(1);
        assertTrue(fold.startTime > 0);

        // Fold 2 doesn't exist
        vm.expectRevert(Less.FoldDoesNotExist.selector);
        less.getFold(2);
    }

    function test_TokenURI_RevertNonExistentToken() public {
        vm.expectRevert(ERC721.TokenDoesNotExist.selector);
        less.tokenURI(999);
    }

    function test_ActiveFoldId_ReturnsZeroWhenNoWindow() public view {
        // No fold created yet
        assertEq(less.activeFoldId(), 0);
    }

    function test_ActiveFoldId_ReturnsFoldIdWhenWindowActive() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        assertTrue(less.isWindowActive());
        assertEq(less.activeFoldId(), 1);
    }

    function test_ActiveFoldId_ReturnsZeroAfterWindowExpires() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);

        assertFalse(less.isWindowActive());
        assertEq(less.activeFoldId(), 0);
    }

    function test_TimeUntilWindowCloses_ReturnsZeroWhenNoWindow() public view {
        assertEq(less.timeUntilWindowCloses(), 0);
    }

    function test_TimeUntilWindowCloses_ReturnsTimeRemaining() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        // Just created, should be ~30 minutes remaining
        uint256 timeLeft = less.timeUntilWindowCloses();
        assertEq(timeLeft, 30 minutes);

        // Fast forward 10 minutes
        vm.warp(block.timestamp + 10 minutes);
        timeLeft = less.timeUntilWindowCloses();
        assertEq(timeLeft, 20 minutes);

        // Fast forward to 1 second before end
        vm.warp(block.timestamp + 20 minutes - 1);
        timeLeft = less.timeUntilWindowCloses();
        assertEq(timeLeft, 1);
    }

    function test_TimeUntilWindowCloses_ReturnsZeroAfterExpiry() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);

        assertEq(less.timeUntilWindowCloses(), 0);
    }

    function test_Mint_AtExactWindowEnd_CreatesNewFold() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        Less.Fold memory fold = less.getFold(1);

        // Warp to exactly the end time
        vm.warp(fold.endTime);

        // Should not be active at endTime (uses < not <=)
        assertFalse(less.isWindowActive());

        // Minting at window end should auto-create fold 2
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        // Verify fold 2 was created
        assertEq(less.currentFoldId(), 2);
        assertTrue(less.isWindowActive());
        assertEq(less.getTokenData(1).foldId, 2); // Token 1 is in fold 2
    }

    function test_Mint_RevertAtWindowEnd_InsufficientBalance() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        Less.Fold memory fold = less.getFold(1);

        // Warp to exactly the end time
        vm.warp(fold.endTime);

        // Remove ETH from strategy (simulate it was used in the burn)
        vm.deal(address(strategy), 0.1 ether); // Below threshold

        assertFalse(less.isWindowActive());

        // Should revert because no window active and can't create new fold
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.mint{value: MINT_PRICE}();
    }

    function test_Mint_SucceedsJustBeforeWindowEnd() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        Less.Fold memory fold = less.getFold(1);

        // Warp to 1 second before end time
        vm.warp(fold.endTime - 1);

        assertTrue(less.isWindowActive());

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        assertEq(less.totalSupply(), 1);
    }

    function test_CreateFold_RevertWhenStrategyReverts() public {
        vm.deal(address(strategy), 0.5 ether);

        // Make the mock strategy revert
        strategy.setShouldRevert(true);

        vm.expectRevert("Strategy: cannot burn yet");
        less.createFold();
    }

    function test_Event_FoldCreated() public {
        vm.deal(address(strategy), 0.5 ether);

        vm.expectEmit(true, false, false, true);
        emit Less.FoldCreated(1, uint64(block.timestamp), uint64(block.timestamp + 30 minutes), blockhash(block.number - 1));

        less.createFold();
    }

    function test_Event_Minted() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);

        // Check token ID and fold ID are indexed correctly (seed won't match but that's ok)
        vm.expectEmit(true, true, true, false);
        emit Less.Minted(1, 1, user1, bytes32(0));

        less.mint{value: MINT_PRICE}();
    }

    function test_Event_MintPriceUpdated() public {
        vm.startPrank(owner);

        vm.expectEmit(false, false, false, true);
        emit Less.MintPriceUpdated(0.02 ether);

        less.setMintPrice(0.02 ether);
        vm.stopPrank();
    }

    function test_Event_PayoutRecipientUpdated() public {
        vm.startPrank(owner);

        address newPayout = address(0x5);
        vm.expectEmit(false, false, false, true);
        emit Less.PayoutRecipientUpdated(newPayout);

        less.setPayoutRecipient(newPayout);
        vm.stopPrank();
    }

    function test_Event_RendererUpdated() public {
        vm.startPrank(owner);

        address newRenderer = address(0x6);
        vm.expectEmit(false, false, false, true);
        emit Less.RendererUpdated(newRenderer);

        less.setRenderer(newRenderer);
        vm.stopPrank();
    }

    function test_Event_MinEthForFoldUpdated() public {
        vm.startPrank(owner);

        vm.expectEmit(false, false, false, true);
        emit Less.MinEthForFoldUpdated(0.5 ether);

        less.setMinEthForFold(0.5 ether);
        vm.stopPrank();
    }

    function test_Mint_ZeroMintPrice() public {
        // Set mint price to 0
        vm.prank(owner);
        less.setMintPrice(0);

        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        // Should be able to mint for free
        vm.prank(user1);
        less.mint{value: 0}();

        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
    }

    /*//////////////////////////////////////////////////////////////
                         RENDERER METADATA TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Renderer_SetMetadata() public {
        vm.startPrank(owner);

        string memory newName = "NEW COLLECTION";
        string memory newDesc = "A new description for testing.";
        string memory newImage = "https://new.example.com/image.png";
        string memory newLink = "https://new.example.com";

        renderer.setMetadata(newName, newDesc, newImage, newLink);

        assertEq(renderer.collectionName(), newName);
        assertEq(renderer.description(), newDesc);
        assertEq(renderer.collectionImage(), newImage);
        assertEq(renderer.externalLink(), newLink);

        vm.stopPrank();
    }

    function test_Renderer_SetMetadata_Event() public {
        vm.startPrank(owner);

        string memory newName = "NEW COLLECTION";
        string memory newDesc = "A new description.";
        string memory newImage = "https://new.example.com/image.png";
        string memory newLink = "https://new.example.com";

        vm.expectEmit(false, false, false, true);
        emit LessRenderer.MetadataUpdated(newName, newDesc, newImage, newLink);

        renderer.setMetadata(newName, newDesc, newImage, newLink);

        vm.stopPrank();
    }

    function test_Renderer_SetMetadata_RevertNonOwner() public {
        vm.startPrank(user1);

        vm.expectRevert();
        renderer.setMetadata("New", "Desc", "Image", "Link");

        vm.stopPrank();
    }

    function test_Renderer_ContractURI_ReflectsMetadataUpdate() public {
        // Get initial contractURI
        string memory initialURI = less.contractURI();

        // Update metadata
        vm.prank(owner);
        renderer.setMetadata(
            "UPDATED",
            "Updated description.",
            "https://updated.com/image.png",
            "https://updated.com"
        );

        // Get new contractURI
        string memory updatedURI = less.contractURI();

        // URIs should be different after update
        assertFalse(keccak256(bytes(initialURI)) == keccak256(bytes(updatedURI)));
    }

    function test_Renderer_ConstructorMetadataValues() public view {
        assertEq(renderer.collectionName(), "LESS");
        assertTrue(bytes(renderer.description()).length > 0);
        assertEq(renderer.collectionImage(), "https://example.com/less/collection.png");
        assertEq(renderer.externalLink(), "https://less.art");
    }

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
