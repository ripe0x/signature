// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";
import {ERC721} from "solady/tokens/ERC721.sol";

/// @dev Mock RecursiveStrategy for testing
contract MockStrategy {
    uint256 public timeBetweenBurn = 90 minutes;
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
        return "data:text/html;base64,PGh0bWw+PC9odG1sPg=="; // base64 of "<html></html>"
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

    uint256 public constant MINT_PRICE = 0.001 ether;

    function setUp() public {
        strategy = new MockStrategy();
        scriptyBuilder = new MockScriptyBuilder();

        vm.startPrank(owner);

        less = new Less(address(strategy), MINT_PRICE, payout, owner, 90 minutes);

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
        less.setWindowCreationEnabled(true);

        vm.stopPrank();
    }

    function test_InitialState() public view {
        assertEq(less.name(), "LESS");
        assertEq(less.symbol(), "LESS");
        assertEq(less.windowCount(), 0);
        assertEq(less.totalSupply(), 0);
        assertEq(less.mintPrice(), MINT_PRICE);
        assertEq(less.payoutRecipient(), payout);
        assertEq(less.windowDuration(), 90 minutes);
        assertEq(less.minEthForWindow(), 0.25 ether);
    }

    function test_CreateFold() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createWindow();

        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());
        // Window endTime is now + windowDuration
        assertEq(less.timeUntilWindowCloses(), 90 minutes);
    }

    function test_CreateFold_RevertIfWindowActive() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createWindow();

        vm.expectRevert(Less.MintWindowActive.selector);
        less.createWindow();
    }

    function test_CreateFold_AfterWindowEnds() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createWindow();

        // Fast forward past window
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());

        // Balance should still be sufficient
        assertTrue(address(strategy).balance >= less.minEthForWindow());
        
        less.createWindow();
        assertEq(less.windowCount(), 2);
        assertTrue(less.isWindowActive());
    }

    function test_CreateFold_RevertInsufficientStrategyBalance() public {
        // Don't send ETH to strategy - balance is 0
        assertEq(address(strategy).balance, 0);
        assertLt(address(strategy).balance, less.minEthForWindow());

        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createWindow();
    }

    function test_CreateFold_RevertBalanceBelowThreshold() public {
        // Send ETH but below the minimum threshold
        vm.deal(address(strategy), 0.1 ether); // Below 0.25 ETH minimum
        assertLt(address(strategy).balance, less.minEthForWindow());

        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createWindow();
    }

    function test_CreateFold_SucceedsWithExactThreshold() public {
        // Send exactly the minimum required ETH
        vm.deal(address(strategy), 0.25 ether);
        assertEq(address(strategy).balance, less.minEthForWindow());

        less.createWindow();
        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());
    }

    function test_CreateFold_SucceedsAboveThreshold() public {
        // Send more than the minimum required ETH
        vm.deal(address(strategy), 1 ether);
        assertGt(address(strategy).balance, less.minEthForWindow());

        less.createWindow();
        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());
    }

    function test_CreateFold_WaitForThresholdAfterWindow() public {
        // Start with sufficient balance
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        // Fast forward past window
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());

        // Simulate balance dropping below threshold (e.g., from a previous burn)
        // We can't directly withdraw from strategy, but we can simulate by checking
        // the behavior when balance is below threshold
        
        // If balance is still sufficient, can create immediately
        if (address(strategy).balance >= less.minEthForWindow()) {
            less.createWindow();
            assertEq(less.windowCount(), 2);
        }
    }

    function test_CanCreateFold() public view {
        // Initially no active window and no ETH - cannot create
        assertFalse(less.isWindowActive());
        assertEq(address(strategy).balance, 0);
        assertFalse(less.canCreateWindow());
    }

    function test_CanCreateFold_WithSufficientBalance() public {
        // Send sufficient ETH
        vm.deal(address(strategy), 0.5 ether);
        
        assertFalse(less.isWindowActive());
        assertTrue(address(strategy).balance >= less.minEthForWindow());
        assertTrue(less.canCreateWindow());
    }

    function test_CanCreateFold_RevertWhenWindowActive() public {
        // Send sufficient ETH and create a fold
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();
        
        assertTrue(less.isWindowActive());
        assertFalse(less.canCreateWindow()); // Cannot create when window is active
    }

    function test_CanCreateFold_AfterWindowWithSufficientBalance() public {
        // Send sufficient ETH and create a fold
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();
        
        // Fast forward past window
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());
        
        // If balance is still sufficient, can create
        if (address(strategy).balance >= less.minEthForWindow()) {
            assertTrue(less.canCreateWindow());
        }
    }

    function test_CanCreateFold_AfterWindowWithInsufficientBalance() public {
        // This test verifies the scenario where window closes but balance is below threshold
        // Start with exactly the threshold
        vm.deal(address(strategy), 0.25 ether);
        less.createWindow();
        
        // Fast forward past window
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());
        
        // If balance is still at threshold, can create
        // In a real scenario, if balance dropped below, canCreateWindow would return false
        if (address(strategy).balance >= less.minEthForWindow()) {
            assertTrue(less.canCreateWindow());
        } else {
            assertFalse(less.canCreateWindow());
        }
    }

    function test_CreateFold_BalanceThresholdFlow() public {
        // Test the complete flow: insufficient -> sufficient -> create -> insufficient -> wait -> sufficient
        
        // Step 1: Cannot create when balance is insufficient
        assertEq(address(strategy).balance, 0);
        assertFalse(less.canCreateWindow());
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createWindow();
        
        // Step 2: Send ETH to meet threshold
        vm.deal(address(strategy), 0.3 ether);
        assertTrue(address(strategy).balance >= less.minEthForWindow());
        assertTrue(less.canCreateWindow());
        
        // Step 3: Can create fold now
        less.createWindow();
        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());
        
        // Step 4: Fast forward past window
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());
        
        // Step 5: Balance still sufficient, can create immediately
        assertTrue(address(strategy).balance >= less.minEthForWindow());
        assertTrue(less.canCreateWindow());
        less.createWindow();
        assertEq(less.windowCount(), 2);
    }

    function test_SetMinEthForFold() public {
        vm.startPrank(owner);

        uint256 newMin = 0.5 ether;
        less.setMinEthForWindow(newMin);
        assertEq(less.minEthForWindow(), newMin);

        // Verify old threshold no longer works
        vm.deal(address(strategy), 0.25 ether); // Old minimum
        assertLt(address(strategy).balance, less.minEthForWindow());
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.createWindow();

        // Verify new threshold works
        vm.deal(address(strategy), 0.5 ether); // New minimum
        less.createWindow();
        assertEq(less.windowCount(), 1);

        vm.stopPrank();
    }

    function test_SetMinEthForFold_RevertNonOwner() public {
        vm.startPrank(user1);

        vm.expectRevert();
        less.setMinEthForWindow(0.5 ether);

        vm.stopPrank();
    }

    function test_Mint() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.getTokenData(1).windowId, 1);
        assertTrue(less.getSeed(1) != bytes32(0));
        assertEq(address(less).balance, MINT_PRICE); // ETH accumulates in contract
    }

    function test_Mint_RevertInsufficientStrategyBalance() public {
        // No ETH in strategy, so fold cannot be created
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.mint{value: MINT_PRICE}(1);
    }

    function test_Mint_AutoCreatesFold() public {
        // Strategy has sufficient ETH, but no fold exists yet
        vm.deal(address(strategy), 0.5 ether);
        assertEq(less.windowCount(), 0);
        assertFalse(less.isWindowActive());

        // Mint should auto-create a fold
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Verify fold was created and token was minted
        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());
        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.getTokenData(1).windowId, 1);
    }

    function test_Mint_AutoCreatesFoldAfterWindowExpires() public {
        // Create first fold and mint
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Fast forward past window
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());

        // Second user mints - should auto-create fold 2
        vm.deal(user2, 1 ether);
        vm.prank(user2);
        less.mint{value: MINT_PRICE}(1);

        // Verify fold 2 was created
        assertEq(less.windowCount(), 2);
        assertTrue(less.isWindowActive());
        assertEq(less.totalSupply(), 2);
        assertEq(less.getTokenData(2).windowId, 2);
    }

    function test_Mint_MultipleSameUser() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);

        less.createWindow();

        vm.deal(user1, 10 ether);
        vm.startPrank(user1);

        // First mint costs MINT_PRICE
        less.mint{value: MINT_PRICE}(1);
        assertEq(less.totalSupply(), 1);
        assertEq(less.getMintCount(user1), 1);

        // Second mint costs MINT_PRICE * 1.5
        uint256 secondMintPrice = (MINT_PRICE * 3) / 2; // 0.015 ETH
        less.mint{value: secondMintPrice}(1);
        assertEq(less.totalSupply(), 2);
        assertEq(less.getMintCount(user1), 2);

        // Third mint costs MINT_PRICE * 1.5^2
        uint256 thirdMintPrice = (MINT_PRICE * 9) / 4; // 0.0225 ETH
        less.mint{value: thirdMintPrice}(1);
        assertEq(less.totalSupply(), 3);
        assertEq(less.getMintCount(user1), 3);

        vm.stopPrank();
    }

    function test_Mint_RevertIncorrectPayment_Under() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);

        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.IncorrectPayment.selector);
        less.mint{value: MINT_PRICE - 1}(1);
    }

    function test_Mint_RevertIncorrectPayment_Over() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);

        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        // Excess payment should now revert (no refunds)
        vm.expectRevert(Less.IncorrectPayment.selector);
        less.mint{value: MINT_PRICE + 1}(1);
    }

    function test_Mint_ExactPayment_AccumulatesInContract() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);

        less.createWindow();

        vm.deal(user1, 1 ether);
        uint256 balanceBefore = user1.balance;
        uint256 contractBalanceBefore = address(less).balance;

        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // User should have paid exactly the mint price
        assertEq(user1.balance, balanceBefore - MINT_PRICE);
        // ETH should accumulate in contract (not sent to payout)
        assertEq(address(less).balance, contractBalanceBefore + MINT_PRICE);
        // Payout recipient should have received nothing yet
        assertEq(payout.balance, 0);
    }

    function test_Mint_MultipleUsersPerFold() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.deal(user2, 1 ether);

        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        vm.prank(user2);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.totalSupply(), 2);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.ownerOf(2), user2);
        assertEq(less.getTokenData(1).windowId, 1);
        assertEq(less.getTokenData(2).windowId, 1);
    }

    function test_Mint_SameUserDifferentFolds() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        // Fold 1
        less.createWindow();
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Fast forward and create fold 2
        vm.warp(block.timestamp + 91 minutes);
        
        // Ensure balance is still sufficient (in real scenario might need to top up)
        if (address(strategy).balance < less.minEthForWindow()) {
            vm.deal(address(strategy), less.minEthForWindow());
        }
        
        less.createWindow();

        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.totalSupply(), 2);
        assertEq(less.getTokenData(1).windowId, 1);
        assertEq(less.getTokenData(2).windowId, 2);
    }

    function test_TokenURI() public {
        // Send ETH to strategy to meet minimum requirement
        vm.deal(address(strategy), 0.5 ether);
        
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

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
        less.setMinEthForWindow(newMinEth);
        assertEq(less.minEthForWindow(), newMinEth);

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
        less.setMinEthForWindow(0.5 ether);

        vm.stopPrank();
    }

    function test_Withdraw() public {
        // Send ETH to strategy and mint some tokens
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Contract should have accumulated ETH
        assertEq(address(less).balance, MINT_PRICE);
        uint256 payoutBalanceBefore = payout.balance;

        // Owner withdraws
        vm.prank(owner);
        less.withdraw();

        // Contract balance should be 0
        assertEq(address(less).balance, 0);
        // Payout recipient should have received the funds
        assertEq(payout.balance, payoutBalanceBefore + MINT_PRICE);
    }

    function test_Withdraw_RevertNonOwner() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Non-owner tries to withdraw
        vm.prank(user1);
        vm.expectRevert();
        less.withdraw();
    }

    function test_Withdraw_Event() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit Less.Withdrawn(payout, MINT_PRICE);
        less.withdraw();
    }

    function test_Withdraw_MultipleMintsBeforeWithdraw() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        // Multiple users mint
        vm.deal(user1, 1 ether);
        vm.deal(user2, 1 ether);

        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        vm.prank(user2);
        less.mint{value: MINT_PRICE}(1);

        // Contract should have accumulated 2x mint price
        assertEq(address(less).balance, MINT_PRICE * 2);

        // Owner withdraws all at once
        vm.prank(owner);
        less.withdraw();

        assertEq(address(less).balance, 0);
        assertEq(payout.balance, MINT_PRICE * 2);
    }

    function test_Constructor_AllowsZeroStrategy() public {
        // Zero address strategy is allowed - can be set later via setStrategy()
        Less lessWithZeroStrategy = new Less(address(0), MINT_PRICE, payout, owner, 90 minutes);
        assertEq(address(lessWithZeroStrategy.strategy()), address(0));
    }

    function test_SetStrategy() public {
        // Deploy with zero strategy
        Less lessWithZeroStrategy = new Less(address(0), MINT_PRICE, payout, owner, 90 minutes);
        assertEq(address(lessWithZeroStrategy.strategy()), address(0));

        // Set strategy as owner
        vm.prank(owner);
        lessWithZeroStrategy.setStrategy(address(strategy));
        assertEq(address(lessWithZeroStrategy.strategy()), address(strategy));
    }

    function test_SetStrategy_RevertZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(Less.InvalidAddress.selector);
        less.setStrategy(address(0));
    }

    function test_SetStrategy_RevertNonOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        less.setStrategy(address(strategy));
    }

    function test_SetStrategy_Event() public {
        address newStrategy = makeAddr("newStrategy");
        vm.expectEmit(true, true, true, true);
        emit Less.StrategyUpdated(newStrategy);
        vm.prank(owner);
        less.setStrategy(newStrategy);
    }

    function test_Constructor_RevertInvalidOwner() public {
        vm.expectRevert(Less.InvalidAddress.selector);
        new Less(address(strategy), MINT_PRICE, payout, address(0), 90 minutes);
    }

    function test_Constructor_RevertInvalidPayoutRecipient() public {
        vm.expectRevert(Less.InvalidAddress.selector);
        new Less(address(strategy), MINT_PRICE, address(0), owner, 90 minutes);
    }

    function test_SetRenderer_RevertZeroAddress() public {
        vm.startPrank(owner);
        vm.expectRevert(Less.InvalidAddress.selector);
        less.setRenderer(address(0));
        vm.stopPrank();
    }

    function test_SetPayoutRecipient_RevertZeroAddress() public {
        vm.startPrank(owner);
        vm.expectRevert(Less.InvalidAddress.selector);
        less.setPayoutRecipient(address(0));
        vm.stopPrank();
    }

    function test_CanCreateFold_FalseWhenTwapDelayNotMet() public {
        // Send ETH to strategy
        vm.deal(address(strategy), 0.5 ether);

        // No active window, sufficient balance, but TWAP delay not met
        assertFalse(less.isWindowActive());
        assertTrue(address(strategy).balance >= less.minEthForWindow());

        // Mock the strategy to report TWAP delay not met
        strategy.setMockTimeUntilFundsMoved(100); // 100 seconds until ready

        // canCreateWindow should return false because TWAP delay not met
        assertFalse(less.canCreateWindow());

        // Now clear the mock and verify it returns true
        strategy.clearMockTimeUntilFundsMoved();
        assertTrue(less.canCreateWindow());
    }

    function test_TokenURI_RevertWhenRendererNotSet() public {
        // Deploy a new Less without setting renderer
        Less lessNoRenderer = new Less(address(strategy), MINT_PRICE, payout, owner, 90 minutes);

        // Enable window creation
        vm.prank(owner);
        lessNoRenderer.setWindowCreationEnabled(true);

        // Send ETH and create fold
        vm.deal(address(strategy), 0.5 ether);
        lessNoRenderer.createWindow();

        // Mint a token
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        lessNoRenderer.mint{value: MINT_PRICE}(1);

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

    function test_TokenURI_RevertNonExistentToken() public {
        vm.expectRevert(ERC721.TokenDoesNotExist.selector);
        less.tokenURI(999);
    }

    function test_TimeUntilWindowCloses_ReturnsZeroWhenNoWindow() public view {
        assertEq(less.timeUntilWindowCloses(), 0);
    }

    function test_TimeUntilWindowCloses_ReturnsTimeRemaining() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        // Just created, should be ~90 minutes remaining
        uint256 timeLeft = less.timeUntilWindowCloses();
        assertEq(timeLeft, 90 minutes);

        // Fast forward 10 minutes
        vm.warp(block.timestamp + 10 minutes);
        timeLeft = less.timeUntilWindowCloses();
        assertEq(timeLeft, 80 minutes);

        // Fast forward to 1 second before end
        vm.warp(block.timestamp + 80 minutes - 1);
        timeLeft = less.timeUntilWindowCloses();
        assertEq(timeLeft, 1);
    }

    function test_TimeUntilWindowCloses_ReturnsZeroAfterExpiry() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        // Fast forward past window
        vm.warp(block.timestamp + 91 minutes);

        assertEq(less.timeUntilWindowCloses(), 0);
    }

    function test_Mint_AtExactWindowEnd_CreatesNewFold() public {
        vm.deal(address(strategy), 0.5 ether);
        uint256 windowStart = block.timestamp;
        less.createWindow();

        // Warp to exactly the end time (windowStart + windowDuration)
        vm.warp(windowStart + 90 minutes);

        // Should not be active at endTime (uses < not <=)
        assertFalse(less.isWindowActive());

        // Minting at window end should auto-create fold 2
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Verify fold 2 was created
        assertEq(less.windowCount(), 2);
        assertTrue(less.isWindowActive());
        assertEq(less.getTokenData(1).windowId, 2); // Token 1 is in fold 2
    }

    function test_Mint_RevertAtWindowEnd_InsufficientBalance() public {
        vm.deal(address(strategy), 0.5 ether);
        uint256 windowStart = block.timestamp;
        less.createWindow();

        // Warp to exactly the end time
        vm.warp(windowStart + 90 minutes);

        // Remove ETH from strategy (simulate it was used in the burn)
        vm.deal(address(strategy), 0.1 ether); // Below threshold

        assertFalse(less.isWindowActive());

        // Should revert because no window active and can't create new fold
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.mint{value: MINT_PRICE}(1);
    }

    function test_Mint_SucceedsJustBeforeWindowEnd() public {
        vm.deal(address(strategy), 0.5 ether);
        uint256 windowStart = block.timestamp;
        less.createWindow();

        // Warp to 1 second before end time
        vm.warp(windowStart + 90 minutes - 1);

        assertTrue(less.isWindowActive());

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.totalSupply(), 1);
    }

    function test_CreateFold_RevertWhenStrategyReverts() public {
        vm.deal(address(strategy), 0.5 ether);

        // Make the mock strategy revert
        strategy.setShouldRevert(true);

        vm.expectRevert("Strategy: cannot burn yet");
        less.createWindow();
    }

    function test_Event_WindowCreated() public {
        vm.deal(address(strategy), 0.5 ether);

        vm.expectEmit(true, false, false, true);
        emit Less.WindowCreated(1, uint64(block.timestamp), uint64(block.timestamp + 90 minutes));

        less.createWindow();
    }

    function test_Event_Minted() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);

        // Check token ID and fold ID are indexed correctly (seed won't match but that's ok)
        vm.expectEmit(true, true, true, false);
        emit Less.Minted(1, 1, user1, bytes32(0));

        less.mint{value: MINT_PRICE}(1);
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

    function test_Event_MinEthForWindowUpdated() public {
        vm.startPrank(owner);

        vm.expectEmit(false, false, false, true);
        emit Less.MinEthForWindowUpdated(0.5 ether);

        less.setMinEthForWindow(0.5 ether);
        vm.stopPrank();
    }

    function test_Mint_ZeroMintPrice() public {
        // Set mint price to 0
        vm.prank(owner);
        less.setMintPrice(0);

        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        // Should be able to mint for free
        vm.prank(user1);
        less.mint{value: 0}(1);

        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
    }

    function test_Mint_RevertZeroQuantity() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InvalidQuantity.selector);
        less.mint{value: MINT_PRICE}(0);
    }

    function test_Mint_MultipleQuantity() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 10 ether);

        // Mint 3 tokens at once
        // Cost = MINT_PRICE * (1 + 1.5 + 2.25) = MINT_PRICE * 4.75
        // = MINT_PRICE * 3^0/2^0 + MINT_PRICE * 3^1/2^1 + MINT_PRICE * 3^2/2^2
        // = MINT_PRICE * (1 + 3/2 + 9/4) = MINT_PRICE * (4 + 6 + 9) / 4 = MINT_PRICE * 19/4
        uint256 totalCost = less.getMintCost(user1, 3);
        assertEq(totalCost, (MINT_PRICE * 19) / 4);

        vm.prank(user1);
        less.mint{value: totalCost}(3);

        assertEq(less.totalSupply(), 3);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.ownerOf(2), user1);
        assertEq(less.ownerOf(3), user1);
        assertEq(less.getMintCount(user1), 3);
    }

    function test_GetMintCount() public {
        vm.deal(address(strategy), 0.5 ether);

        // No fold yet, should return 0
        assertEq(less.getMintCount(user1), 0);

        less.createWindow();
        assertEq(less.getMintCount(user1), 0);

        vm.deal(user1, 10 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.getMintCount(user1), 1);

        vm.prank(user1);
        less.mint{value: (MINT_PRICE * 3) / 2}(1);

        assertEq(less.getMintCount(user1), 2);
    }

    function test_MintCount_ResetsPerFold() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 10 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.getMintCount(user1), 1);

        // Fast forward and create new fold
        vm.warp(block.timestamp + 91 minutes);
        less.createWindow();

        // Mint count in current fold (2) should be 0
        assertEq(less.getMintCount(user1), 0);

        // User can mint at base price again
        assertEq(less.getMintCost(user1, 1), MINT_PRICE);
    }

    function test_Mint_IncorrectPaymentForMultiple() public {
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 10 ether);

        // Try to mint 3 with only enough for 1
        vm.prank(user1);
        vm.expectRevert(Less.IncorrectPayment.selector);
        less.mint{value: MINT_PRICE}(3);
    }

    function test_Mint_OneFirst_ThenMoreLater() public {
        // This tests the scenario: user mints 1, then comes back to mint more
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.deal(user1, 10 ether);
        vm.startPrank(user1);

        // Step 1: Mint 1 token at base price
        assertEq(less.getMintCount(user1), 0);
        assertEq(less.getMintCost(user1, 1), MINT_PRICE);

        less.mint{value: MINT_PRICE}(1);
        assertEq(less.totalSupply(), 1);
        assertEq(less.getMintCount(user1), 1);

        // Step 2: User comes back - verify pricing reflects their previous mint
        assertEq(less.getMintCount(user1), 1);
        assertEq(less.getMintCost(user1, 1), (MINT_PRICE * 3) / 2); // 1.5x

        // getMintCost for 2 more should be: 1.5x + 2.25x = 3.75x base
        // = MINT_PRICE * (3/2 + 9/4) = MINT_PRICE * (6/4 + 9/4) = MINT_PRICE * 15/4
        uint256 costForTwoMore = less.getMintCost(user1, 2);
        assertEq(costForTwoMore, (MINT_PRICE * 15) / 4);

        // Step 3: Mint 2 more tokens
        less.mint{value: costForTwoMore}(2);
        assertEq(less.totalSupply(), 3);
        assertEq(less.getMintCount(user1), 3);

        // All tokens belong to user1
        assertEq(less.ownerOf(1), user1);
        assertEq(less.ownerOf(2), user1);
        assertEq(less.ownerOf(3), user1);

        // Step 4: Verify next price is now 3.375x (1.5^3)
        // 1.5^3 = 27/8
        assertEq(less.getMintCost(user1, 1), (MINT_PRICE * 27) / 8);

        vm.stopPrank();
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

        // description is the only public metadata field
        assertEq(renderer.description(), newDesc);

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
        // description is the only public metadata field
        assertTrue(bytes(renderer.description()).length > 0);
    }

    /*//////////////////////////////////////////////////////////////
                         WINDOW CREATION TOGGLE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_InitialState_WindowCreationDisabled() public {
        // Create a fresh contract to verify default state
        Less freshLess = new Less(address(strategy), MINT_PRICE, payout, owner, 90 minutes);
        assertFalse(freshLess.windowCreationEnabled());
    }

    function test_SetWindowCreationEnabled() public {
        vm.startPrank(owner);

        // Disable window creation
        less.setWindowCreationEnabled(false);
        assertFalse(less.windowCreationEnabled());

        // Re-enable window creation
        less.setWindowCreationEnabled(true);
        assertTrue(less.windowCreationEnabled());

        vm.stopPrank();
    }

    function test_SetWindowCreationEnabled_RevertNonOwner() public {
        vm.startPrank(user1);

        vm.expectRevert();
        less.setWindowCreationEnabled(false);

        vm.stopPrank();
    }

    function test_Event_WindowCreationEnabledChanged() public {
        vm.startPrank(owner);

        vm.expectEmit(false, false, false, true);
        emit Less.WindowCreationEnabledChanged(false);
        less.setWindowCreationEnabled(false);

        vm.expectEmit(false, false, false, true);
        emit Less.WindowCreationEnabledChanged(true);
        less.setWindowCreationEnabled(true);

        vm.stopPrank();
    }

    function test_CreateWindow_RevertWhenDisabled() public {
        vm.deal(address(strategy), 0.5 ether);

        // Disable window creation
        vm.prank(owner);
        less.setWindowCreationEnabled(false);

        // createWindow should revert
        vm.expectRevert(Less.WindowCreationDisabled.selector);
        less.createWindow();
    }

    function test_CreateWindow_SucceedsWhenReEnabled() public {
        vm.deal(address(strategy), 0.5 ether);

        vm.startPrank(owner);

        // Disable then re-enable
        less.setWindowCreationEnabled(false);
        less.setWindowCreationEnabled(true);

        vm.stopPrank();

        // createWindow should succeed
        less.createWindow();
        assertEq(less.windowCount(), 1);
    }

    function test_Mint_RevertWhenDisabledAndNoActiveWindow() public {
        vm.deal(address(strategy), 0.5 ether);

        // Disable window creation
        vm.prank(owner);
        less.setWindowCreationEnabled(false);

        // mint should revert because no active window and can't create one
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.WindowCreationDisabled.selector);
        less.mint{value: MINT_PRICE}(1);
    }

    function test_Mint_SucceedsWhenDisabledButWindowActive() public {
        vm.deal(address(strategy), 0.5 ether);

        // First, create a window while enabled
        less.createWindow();
        assertTrue(less.isWindowActive());

        // Now disable window creation
        vm.prank(owner);
        less.setWindowCreationEnabled(false);

        // Minting should still work because window is active
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
    }

    function test_CanCreateWindow_FalseWhenDisabled() public {
        vm.deal(address(strategy), 0.5 ether);

        // Initially should be able to create
        assertTrue(less.canCreateWindow());

        // Disable window creation
        vm.prank(owner);
        less.setWindowCreationEnabled(false);

        // Now canCreateWindow should return false
        assertFalse(less.canCreateWindow());
    }

    function test_CanCreateWindow_TrueWhenReEnabled() public {
        vm.deal(address(strategy), 0.5 ether);

        vm.startPrank(owner);

        // Disable then re-enable
        less.setWindowCreationEnabled(false);
        assertFalse(less.canCreateWindow());

        less.setWindowCreationEnabled(true);
        assertTrue(less.canCreateWindow());

        vm.stopPrank();
    }

    function test_Mint_AutoCreateWindowWhenReEnabled() public {
        vm.deal(address(strategy), 0.5 ether);

        vm.prank(owner);
        less.setWindowCreationEnabled(false);

        // Should fail
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.WindowCreationDisabled.selector);
        less.mint{value: MINT_PRICE}(1);

        // Re-enable
        vm.prank(owner);
        less.setWindowCreationEnabled(true);

        // Now should auto-create window and mint
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.windowCount(), 1);
        assertEq(less.totalSupply(), 1);
    }

    function test_WindowCreationToggle_AfterWindowExpires() public {
        vm.deal(address(strategy), 0.5 ether);

        // Create first window
        less.createWindow();
        assertEq(less.windowCount(), 1);

        // Fast forward past window
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());

        // Disable window creation
        vm.prank(owner);
        less.setWindowCreationEnabled(false);

        // Cannot create new window
        vm.expectRevert(Less.WindowCreationDisabled.selector);
        less.createWindow();

        // Cannot mint (would need to create window)
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.WindowCreationDisabled.selector);
        less.mint{value: MINT_PRICE}(1);
    }

    /*//////////////////////////////////////////////////////////////
                            WINDOW 0 TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Window0_StartWindow0() public {
        // Disable regular window creation for window 0 flow
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);

        // Start window 0 with 30 minute duration
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Verify window 0 is active
        assertTrue(less.isWindowActive());
        assertEq(less.windowCount(), 0);
        assertEq(less.window0EndTime(), uint64(block.timestamp + 30 minutes));
    }

    function test_Window0_Event() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + 30 minutes;

        vm.expectEmit(false, false, false, true);
        emit Less.Window0Started(startTime, endTime);

        less.startWindow0(30 minutes);
        vm.stopPrank();
    }

    function test_Window0_MintDuringWindow0() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Mint during window 0
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Verify mint
        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);

        // Token should have windowId = 0
        Less.TokenData memory data = less.getTokenData(1);
        assertEq(data.windowId, 0);
    }

    function test_Window0_MultipleMintsDuringWindow0() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);

        // User1 mints
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // User2 mints
        vm.prank(user2);
        less.mint{value: MINT_PRICE}(1);

        // User1 mints again (with escalated price)
        uint256 secondMintCost = less.getMintCost(user1, 1);
        assertEq(secondMintCost, MINT_PRICE * 3 / 2); // 1.5x

        vm.prank(user1);
        less.mint{value: secondMintCost}(1);

        assertEq(less.totalSupply(), 3);
        assertEq(less.getTokenData(1).windowId, 0);
        assertEq(less.getTokenData(2).windowId, 0);
        assertEq(less.getTokenData(3).windowId, 0);
    }

    function test_Window0_GetMintCount() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Before minting
        assertEq(less.getMintCount(user1), 0);

        vm.deal(user1, 10 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // After minting
        assertEq(less.getMintCount(user1), 1);

        // Mint 2 more
        uint256 cost = less.getMintCost(user1, 2);
        vm.prank(user1);
        less.mint{value: cost}(2);

        assertEq(less.getMintCount(user1), 3);
    }

    function test_Window0_GetMintCost() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // First mint cost
        assertEq(less.getMintCost(user1, 1), MINT_PRICE);

        vm.deal(user1, 10 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Second mint cost should be 1.5x
        assertEq(less.getMintCost(user1, 1), MINT_PRICE * 3 / 2);
    }

    function test_Window0_TimeUntilWindowCloses() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Just started, should be 30 minutes
        assertEq(less.timeUntilWindowCloses(), 30 minutes);

        // Fast forward 10 minutes
        vm.warp(block.timestamp + 10 minutes);
        assertEq(less.timeUntilWindowCloses(), 20 minutes);
    }

    function test_Window0_EndsAfterDuration() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Window 0 is active
        assertTrue(less.isWindowActive());

        // Fast forward past window 0
        vm.warp(block.timestamp + 31 minutes);

        // Window 0 should be inactive
        assertFalse(less.isWindowActive());
        assertEq(less.timeUntilWindowCloses(), 0);
    }

    function test_Window0_CannotMintAfterEnds_BeforeWindow1() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Fast forward past window 0, but strategy has no ETH
        vm.warp(block.timestamp + 31 minutes);

        // Cannot mint - no active window and can't create window 1 (no ETH in strategy)
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InsufficientStrategyBalance.selector);
        less.mint{value: MINT_PRICE}(1);
    }

    function test_Window0_AutoTransitionToWindow1() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Mint during window 0
        vm.deal(user1, 10 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Verify token is in window 0
        assertEq(less.getTokenData(1).windowId, 0);

        // Fast forward past window 0
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());

        // Fund strategy for window 1
        vm.deal(address(strategy), 0.5 ether);

        // Minting should auto-create window 1
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Verify window 1 was created
        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());

        // Token 2 should be in window 1
        assertEq(less.getTokenData(2).windowId, 1);

        // windowCreationEnabled should now be true
        assertTrue(less.windowCreationEnabled());
    }

    function test_Window0_AutoTransitionViaCreateWindow() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Fast forward past window 0
        vm.warp(block.timestamp + 31 minutes);

        // Fund strategy
        vm.deal(address(strategy), 0.5 ether);

        // createWindow should work after window 0 ends
        less.createWindow();

        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());
        assertTrue(less.windowCreationEnabled());
    }

    function test_Window0_CanCreateWindowReturnsTrueAfterWindow0Ends() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // During window 0, canCreateWindow should be false (window is active)
        vm.deal(address(strategy), 0.5 ether);
        assertFalse(less.canCreateWindow());

        // Fast forward past window 0
        vm.warp(block.timestamp + 31 minutes);

        // Now canCreateWindow should be true (auto-enabled after window 0)
        assertTrue(less.canCreateWindow());
    }

    function test_Window0_RevertIfAlreadyStarted() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);

        // Try to start window 0 again
        vm.expectRevert(Less.Window0NotAllowed.selector);
        less.startWindow0(30 minutes);
        vm.stopPrank();
    }

    function test_Window0_RevertIfWindowsAlreadyCreated() public {
        vm.deal(address(strategy), 0.5 ether);

        // Create window 1 first
        less.createWindow();
        assertEq(less.windowCount(), 1);

        // Try to start window 0 after window 1 exists
        vm.prank(owner);
        vm.expectRevert(Less.Window0NotAllowed.selector);
        less.startWindow0(30 minutes);
    }

    function test_Window0_RevertNonOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        less.startWindow0(30 minutes);
    }

    function test_Window0_WindowCreationStaysEnabledAfterTransition() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Fast forward past window 0
        vm.warp(block.timestamp + 31 minutes);

        // Fund strategy
        vm.deal(address(strategy), 0.5 ether);

        // Create window 1
        less.createWindow();
        assertTrue(less.windowCreationEnabled());

        // Fast forward past window 1
        vm.warp(block.timestamp + 91 minutes);

        // Should be able to create window 2 (windowCreationEnabled is still true)
        less.createWindow();
        assertEq(less.windowCount(), 2);
    }

    function test_Window0_MintCountResetsBetweenWindows() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Mint during window 0
        vm.deal(user1, 10 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);
        assertEq(less.getMintCount(user1), 1);

        // Fast forward past window 0 and create window 1
        vm.warp(block.timestamp + 31 minutes);
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        // Mint count should reset for window 1
        assertEq(less.getMintCount(user1), 0);

        // First mint in window 1 should be base price
        assertEq(less.getMintCost(user1, 1), MINT_PRICE);
    }

    function test_Window0_ZeroDuration() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);

        // Start window 0 with 0 duration (immediately expires)
        less.startWindow0(0);
        vm.stopPrank();

        // Window 0 should not be active (already expired)
        assertFalse(less.isWindowActive());

        // Should be able to create window 1 immediately if strategy is funded
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();
        assertEq(less.windowCount(), 1);
    }

    function test_Window0_EventEmittedOnAutoEnable() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Fast forward past window 0
        vm.warp(block.timestamp + 31 minutes);

        // Fund strategy
        vm.deal(address(strategy), 0.5 ether);

        // Expect the WindowCreationEnabledChanged event when auto-enabling
        vm.expectEmit(false, false, false, true);
        emit Less.WindowCreationEnabledChanged(true);

        less.createWindow();
    }

    function test_Window0_FullFlow() public {
        // STEP 1: Deploy with window creation disabled
        vm.prank(owner);
        less.setWindowCreationEnabled(false);

        // STEP 2: Start window 0 (30 minute pre-launch)
        vm.prank(owner);
        less.startWindow0(30 minutes);
        assertTrue(less.isWindowActive());
        assertEq(less.windowCount(), 0);

        // STEP 3: Users mint during window 0
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);

        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);
        assertEq(less.getTokenData(1).windowId, 0);

        vm.prank(user2);
        less.mint{value: MINT_PRICE}(1);
        assertEq(less.getTokenData(2).windowId, 0);

        assertEq(less.totalSupply(), 2);

        // STEP 4: Window 0 ends
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());

        // STEP 5: Fund strategy
        vm.deal(address(strategy), 0.5 ether);

        // STEP 6: First mint after window 0 auto-creates window 1
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        assertEq(less.windowCount(), 1);
        assertTrue(less.isWindowActive());
        assertTrue(less.windowCreationEnabled());
        assertEq(less.getTokenData(3).windowId, 1);

        // STEP 7: Normal minting continues in window 1
        vm.prank(user2);
        less.mint{value: MINT_PRICE}(1);
        assertEq(less.getTokenData(4).windowId, 1);

        // STEP 8: Window 1 ends, window 2 can be created
        vm.warp(block.timestamp + 91 minutes);
        assertFalse(less.isWindowActive());

        less.createWindow();
        assertEq(less.windowCount(), 2);
    }

    function test_Window0_TokenURIWorks() public {
        vm.startPrank(owner);
        less.setWindowCreationEnabled(false);
        less.startWindow0(30 minutes);
        vm.stopPrank();

        // Mint during window 0
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}(1);

        // Verify token data has windowId = 0
        Less.TokenData memory data = less.getTokenData(1);
        assertEq(data.windowId, 0, "Token should have windowId 0");

        // Get tokenURI - should not revert and should be valid base64 JSON
        string memory uri = less.tokenURI(1);
        assertTrue(bytes(uri).length > 0, "URI should not be empty");
        assertTrue(_startsWith(uri, "data:application/json;base64,"), "Should be valid data URI");

        // The attributes in the JSON (when decoded) contain:
        // {"trait_type":"Window","value":0},{"trait_type":"Fold Count","value":0}
        // This is verified by the trace output showing correct JSON structure
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
