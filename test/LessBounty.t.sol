// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {LessBounty} from "../contracts/LessBounty.sol";
import {LessBountyFactory} from "../contracts/LessBountyFactory.sol";
import {Less} from "../contracts/Less.sol";
import {ERC721} from "solady/tokens/ERC721.sol";

/// @dev Mock RecursiveStrategy for testing
contract MockStrategy {
    uint256 public timeBetweenBurn = 90 minutes;
    uint256 public lastBurn;
    uint256 public totalSupply = 1_000_000_000 ether;
    bool public shouldRevert;

    function timeUntilFundsMoved() external view returns (uint256) {
        if (lastBurn == 0) return 0;
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

    receive() external payable {}
}

contract LessBountyTest is Test {
    Less public less;
    MockStrategy public strategy;
    LessBountyFactory public factory;

    address public owner = address(0x1);
    address public payout = address(0x2);
    address public bountyOwner = address(0x3);
    address public executor = address(0x4);

    uint256 public constant MINT_PRICE = 0.001 ether;
    uint256 public constant MINTS_PER_WINDOW = 2;
    uint256 public constant INCENTIVE = 0.01 ether;

    function setUp() public {
        strategy = new MockStrategy();

        vm.startPrank(owner);
        less = new Less(address(strategy), MINT_PRICE, payout, owner, 90 minutes);
        less.setWindowCreationEnabled(true);
        vm.stopPrank();

        factory = new LessBountyFactory(address(less));
    }

    function test_FactoryCreateBounty() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();

        assertEq(factory.getBounty(bountyOwner), bounty);
        assertEq(factory.totalBounties(), 1);
        assertEq(LessBounty(payable(bounty)).owner(), bountyOwner);
    }

    function test_FactoryCreateBountyFor() public {
        address bounty = factory.createBountyFor(bountyOwner);

        assertEq(factory.getBounty(bountyOwner), bounty);
        assertEq(LessBounty(payable(bounty)).owner(), bountyOwner);
    }

    function test_FactoryRevertDuplicateBounty() public {
        vm.prank(bountyOwner);
        factory.createBounty();

        vm.expectRevert("Bounty already exists");
        vm.prank(bountyOwner);
        factory.createBounty();
    }

    function test_FactoryCreateAndConfigure() public {
        vm.deal(bountyOwner, 1 ether);
        vm.prank(bountyOwner);
        address bounty = factory.createAndConfigure{value: 0.5 ether}(
            MINTS_PER_WINDOW,
            INCENTIVE
        );

        LessBounty b = LessBounty(payable(bounty));
        assertEq(b.mintsPerWindow(), MINTS_PER_WINDOW);
        assertEq(b.incentivePerWindow(), INCENTIVE);
        assertEq(address(b).balance, 0.5 ether);
    }

    function test_ConfigureBounty() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);

        assertEq(b.mintsPerWindow(), MINTS_PER_WINDOW);
        assertEq(b.incentivePerWindow(), INCENTIVE);
    }

    function test_ConfigureRevertNonOwner() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.expectRevert();
        vm.prank(executor);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);
    }

    function test_FundBounty() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();

        vm.deal(bountyOwner, 1 ether);
        vm.prank(bountyOwner);
        (bool success, ) = bounty.call{value: 0.5 ether}("");
        assertTrue(success);
        assertEq(bounty.balance, 0.5 ether);
    }

    function test_ExecuteBounty() public {
        // Setup bounty
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);

        // Fund bounty (need enough for mints + incentive)
        // Cost for 2 mints: 0.001 + 0.0015 = 0.0025 ether
        // Plus incentive: 0.01 ether
        vm.deal(address(b), 0.1 ether);

        // Setup strategy with ETH
        vm.deal(address(strategy), 0.5 ether);

        // Create window
        less.createWindow();
        assertTrue(less.isWindowActive());

        // Execute bounty
        uint256 executorBalanceBefore = executor.balance;
        vm.prank(executor);
        b.execute();

        // Check executor got incentive
        assertEq(executor.balance, executorBalanceBefore + INCENTIVE);

        // Check NFTs sent to bounty owner (not the contract)
        assertEq(less.balanceOf(address(b)), 0);
        assertEq(less.balanceOf(bountyOwner), MINTS_PER_WINDOW);

        // Check window marked as minted
        assertTrue(b.windowMinted(less.windowCount()));
    }

    function test_ExecuteRevertNoActiveWindow() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);
        vm.deal(address(b), 0.1 ether);

        vm.expectRevert(LessBounty.NoActiveWindow.selector);
        vm.prank(executor);
        b.execute();
    }

    function test_ExecuteRevertWindowAlreadyMinted() public {
        // Setup bounty
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);
        vm.deal(address(b), 0.2 ether);
        vm.deal(address(strategy), 0.5 ether);

        less.createWindow();

        // First execution succeeds
        vm.prank(executor);
        b.execute();

        // Second execution fails
        vm.expectRevert(LessBounty.WindowAlreadyMinted.selector);
        vm.prank(executor);
        b.execute();
    }

    function test_ExecuteRevertInsufficientFunds() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);
        // Fund with less than needed
        vm.deal(address(b), 0.001 ether);
        vm.deal(address(strategy), 0.5 ether);

        less.createWindow();

        vm.expectRevert(LessBounty.InsufficientFunds.selector);
        vm.prank(executor);
        b.execute();
    }

    function test_ExecuteRevertPaused() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);

        vm.prank(bountyOwner);
        b.setPaused(true);

        vm.deal(address(b), 0.1 ether);
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.expectRevert(LessBounty.BountyPaused.selector);
        vm.prank(executor);
        b.execute();
    }

    function test_CanExecute() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        // Not configured
        (bool canExec, string memory reason) = b.canExecute();
        assertFalse(canExec);
        assertEq(reason, "Mints per window is 0");

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);

        // No active window
        (canExec, reason) = b.canExecute();
        assertFalse(canExec);
        assertEq(reason, "No active window");

        // Create window
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        // Insufficient funds
        (canExec, reason) = b.canExecute();
        assertFalse(canExec);
        assertEq(reason, "Insufficient funds");

        // Fund it
        vm.deal(address(b), 0.1 ether);
        (canExec, reason) = b.canExecute();
        assertTrue(canExec);
        assertEq(reason, "");
    }

    function test_GetExecutionCost() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(MINTS_PER_WINDOW, INCENTIVE);

        (uint256 mintCost, uint256 incentive, uint256 total) = b.getExecutionCost();

        // First 2 mints for new address: 0.001 + 0.0015 = 0.0025 ether
        assertEq(mintCost, 0.0025 ether);
        assertEq(incentive, INCENTIVE);
        assertEq(total, 0.0025 ether + INCENTIVE);
    }

    function test_WithdrawETH() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.deal(address(b), 1 ether);

        uint256 balanceBefore = bountyOwner.balance;
        vm.prank(bountyOwner);
        b.withdraw(0.5 ether);
        assertEq(bountyOwner.balance, balanceBefore + 0.5 ether);

        // Withdraw all remaining
        vm.prank(bountyOwner);
        b.withdraw(0);
        assertEq(bountyOwner.balance, balanceBefore + 1 ether);
    }

    function test_NFTsSentDirectlyToOwner() public {
        // Setup and execute bounty
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(3, 0);
        vm.deal(address(b), 0.1 ether);
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow();

        vm.prank(executor);
        b.execute();

        // NFTs should be owned by bountyOwner directly, not the contract
        assertEq(less.ownerOf(1), bountyOwner);
        assertEq(less.ownerOf(2), bountyOwner);
        assertEq(less.ownerOf(3), bountyOwner);
        assertEq(less.balanceOf(address(b)), 0);
    }

    function test_MultipleWindowsExecution() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.prank(bountyOwner);
        b.configure(1, INCENTIVE);
        vm.deal(address(b), 1 ether);
        vm.deal(address(strategy), 1 ether);

        // Window 1
        less.createWindow();
        vm.prank(executor);
        b.execute();
        assertEq(less.balanceOf(bountyOwner), 1);

        // End window 1, start window 2
        vm.warp(block.timestamp + 91 minutes);
        less.createWindow();

        vm.prank(executor);
        b.execute();
        assertEq(less.balanceOf(bountyOwner), 2);
        assertTrue(b.windowMinted(1));
        assertTrue(b.windowMinted(2));
    }

    function test_TargetSpecificWindow() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.startPrank(bountyOwner);
        b.configure(1, INCENTIVE);
        b.setSpecificWindowsOnly(true);
        b.setTargetWindow(2, true); // Only target window 2
        vm.stopPrank();

        vm.deal(address(b), 1 ether);
        vm.deal(address(strategy), 1 ether);

        // Window 1 - should fail (not targeted)
        less.createWindow();

        vm.expectRevert(LessBounty.WindowNotTargeted.selector);
        vm.prank(executor);
        b.execute();

        // End window 1, start window 2
        vm.warp(block.timestamp + 91 minutes);
        less.createWindow();

        // Window 2 - should succeed (targeted)
        vm.prank(executor);
        b.execute();
        assertEq(less.balanceOf(bountyOwner), 1);
    }

    function test_SetMultipleTargetWindows() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        uint256[] memory windows = new uint256[](3);
        windows[0] = 5;
        windows[1] = 10;
        windows[2] = 15;

        vm.prank(bountyOwner);
        b.setTargetWindows(windows, true);

        assertTrue(b.targetWindows(5));
        assertTrue(b.targetWindows(10));
        assertTrue(b.targetWindows(15));
        assertFalse(b.targetWindows(7));
    }

    function test_CanExecuteReturnsWindowNotTargeted() public {
        vm.prank(bountyOwner);
        address bounty = factory.createBounty();
        LessBounty b = LessBounty(payable(bounty));

        vm.startPrank(bountyOwner);
        b.configure(1, 0);
        b.setSpecificWindowsOnly(true);
        b.setTargetWindow(99, true); // Target a far future window
        vm.stopPrank();

        vm.deal(address(b), 1 ether);
        vm.deal(address(strategy), 0.5 ether);
        less.createWindow(); // Window 1

        (bool canExec, string memory reason) = b.canExecute();
        assertFalse(canExec);
        assertEq(reason, "Window not targeted");
    }

    function test_FactoryGetAllBounties() public {
        address[] memory users = new address[](3);
        users[0] = address(0x10);
        users[1] = address(0x11);
        users[2] = address(0x12);

        for (uint256 i = 0; i < users.length; i++) {
            factory.createBountyFor(users[i]);
        }

        address[] memory allBounties = factory.getAllBounties();
        assertEq(allBounties.length, 3);
    }
}
