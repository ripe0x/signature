// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PayoutSplitter} from "../contracts/PayoutSplitter.sol";

/// @dev Mock LessToken that tracks fees received
contract MockLessToken {
    uint256 public currentFees;

    function addFeesManual() external payable {
        currentFees += msg.value;
    }

    receive() external payable {}
}

/// @dev Mock LessToken that reverts on addFeesManual
contract RevertingLessToken {
    function addFeesManual() external payable {
        revert("MockRevert");
    }
}

contract PayoutSplitterTest is Test {
    PayoutSplitter public splitter;
    MockLessToken public lessToken;

    address public owner = address(0x1);
    address public team = address(0xea194A186EBe76A84E2B2027f5f23F81939c05AD);
    address public newTeam = address(0x5);
    address public caller = address(0x6);

    function setUp() public {
        lessToken = new MockLessToken();

        vm.prank(owner);
        splitter = new PayoutSplitter(address(lessToken), team, owner);
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR TESTS
    //////////////////////////////////////////////////////////////*/

    function test_constructor_setsLessToken() public view {
        assertEq(splitter.lessToken(), address(lessToken));
    }

    function test_constructor_setsTeam() public view {
        assertEq(splitter.team(), team);
    }

    function test_constructor_setsOwner() public view {
        assertEq(splitter.owner(), owner);
    }

    function test_constructor_setsDefaultIncentive() public view {
        assertEq(splitter.callerIncentiveBps(), 50); // 0.5%
    }

    function test_constructor_revertsOnZeroLessToken() public {
        vm.expectRevert(PayoutSplitter.ZeroAddress.selector);
        new PayoutSplitter(address(0), team, owner);
    }

    function test_constructor_revertsOnZeroTeam() public {
        vm.expectRevert(PayoutSplitter.ZeroAddress.selector);
        new PayoutSplitter(address(lessToken), address(0), owner);
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(PayoutSplitter.ZeroAddress.selector);
        new PayoutSplitter(address(lessToken), team, address(0));
    }

    /*//////////////////////////////////////////////////////////////
                              RECEIVE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_receive_acceptsETH() public {
        vm.deal(caller, 1 ether);
        vm.prank(caller);
        (bool success,) = address(splitter).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(splitter).balance, 1 ether);
    }

    /*//////////////////////////////////////////////////////////////
                              SPLIT TESTS
    //////////////////////////////////////////////////////////////*/

    function test_split_distributesCorrectly() public {
        // Send 1 ETH to splitter
        vm.deal(address(splitter), 1 ether);

        uint256 callerBalanceBefore = caller.balance;
        uint256 teamBalanceBefore = team.balance;

        vm.prank(caller);
        splitter.split();

        // 0.5% = 0.005 ETH to caller
        assertEq(caller.balance - callerBalanceBefore, 0.005 ether);

        // Remaining = 0.995 ETH
        // 20% of 0.995 = 0.199 ETH to lessToken
        assertEq(lessToken.currentFees(), 0.199 ether);

        // 80% of 0.995 = 0.796 ETH to team
        assertEq(team.balance - teamBalanceBefore, 0.796 ether);

        // Splitter balance should be 0
        assertEq(address(splitter).balance, 0);
    }

    function test_split_distributesCorrectlyWithSmallAmount() public {
        // Send 100 wei to splitter
        vm.deal(address(splitter), 100);

        uint256 callerBalanceBefore = caller.balance;
        uint256 teamBalanceBefore = team.balance;

        vm.prank(caller);
        splitter.split();

        // 0.5% of 100 = 0 (rounds down)
        assertEq(caller.balance - callerBalanceBefore, 0);

        // Remaining = 100, 20% = 20 to lessToken
        assertEq(lessToken.currentFees(), 20);

        // 80 to team
        assertEq(team.balance - teamBalanceBefore, 80);
    }

    function test_split_anyoneCanCall() public {
        vm.deal(address(splitter), 1 ether);

        address randomCaller = address(0x999);
        uint256 randomCallerBalanceBefore = randomCaller.balance;

        vm.prank(randomCaller);
        splitter.split();

        // Random caller gets the incentive
        assertEq(randomCaller.balance - randomCallerBalanceBefore, 0.005 ether);
    }

    function test_split_revertsOnZeroBalance() public {
        vm.expectRevert(PayoutSplitter.NoBalance.selector);
        splitter.split();
    }

    function test_split_emitsEvent() public {
        vm.deal(address(splitter), 1 ether);

        vm.expectEmit(true, true, true, true);
        emit PayoutSplitter.Split(0.005 ether, 0.199 ether, 0.796 ether);

        vm.prank(caller);
        splitter.split();
    }

    function test_split_worksMultipleTimes() public {
        // First split
        vm.deal(address(splitter), 1 ether);
        vm.prank(caller);
        splitter.split();
        assertEq(lessToken.currentFees(), 0.199 ether);

        // Second split
        vm.deal(address(splitter), 1 ether);
        vm.prank(caller);
        splitter.split();
        assertEq(lessToken.currentFees(), 0.398 ether); // Accumulated
    }

    function test_split_fuzz(uint256 amount) public {
        // Bound to reasonable amounts (1000 wei to 1000 ETH)
        amount = bound(amount, 1000, 1000 ether);

        vm.deal(address(splitter), amount);
        uint256 callerBalanceBefore = caller.balance;
        uint256 teamBalanceBefore = team.balance;

        vm.prank(caller);
        splitter.split();

        uint256 expectedToCaller = (amount * 50) / 10000;
        uint256 remaining = amount - expectedToCaller;
        uint256 expectedToLess = remaining / 5;
        uint256 expectedToTeam = remaining - expectedToLess;

        assertEq(caller.balance - callerBalanceBefore, expectedToCaller);
        assertEq(lessToken.currentFees(), expectedToLess);
        assertEq(team.balance - teamBalanceBefore, expectedToTeam);
        assertEq(address(splitter).balance, 0);
    }

    /*//////////////////////////////////////////////////////////////
                        CALLER INCENTIVE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_setCallerIncentive_updatesValue() public {
        vm.prank(owner);
        splitter.setCallerIncentive(100); // 1%

        assertEq(splitter.callerIncentiveBps(), 100);
    }

    function test_setCallerIncentive_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit PayoutSplitter.CallerIncentiveUpdated(100);

        vm.prank(owner);
        splitter.setCallerIncentive(100);
    }

    function test_setCallerIncentive_onlyOwner() public {
        vm.prank(caller);
        vm.expectRevert();
        splitter.setCallerIncentive(100);
    }

    function test_setCallerIncentive_revertsIfTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(PayoutSplitter.IncentiveTooHigh.selector);
        splitter.setCallerIncentive(1001); // > 10%
    }

    function test_setCallerIncentive_allowsMax10Percent() public {
        vm.prank(owner);
        splitter.setCallerIncentive(1000); // 10%

        assertEq(splitter.callerIncentiveBps(), 1000);
    }

    function test_setCallerIncentive_allowsZero() public {
        vm.prank(owner);
        splitter.setCallerIncentive(0);

        assertEq(splitter.callerIncentiveBps(), 0);
    }

    function test_split_usesUpdatedIncentive() public {
        // Set incentive to 1%
        vm.prank(owner);
        splitter.setCallerIncentive(100);

        vm.deal(address(splitter), 1 ether);
        uint256 callerBalanceBefore = caller.balance;

        vm.prank(caller);
        splitter.split();

        // 1% = 0.01 ETH to caller
        assertEq(caller.balance - callerBalanceBefore, 0.01 ether);
    }

    function test_split_noIncentiveWhenZero() public {
        // Set incentive to 0
        vm.prank(owner);
        splitter.setCallerIncentive(0);

        vm.deal(address(splitter), 1 ether);
        uint256 callerBalanceBefore = caller.balance;
        uint256 teamBalanceBefore = team.balance;

        vm.prank(caller);
        splitter.split();

        // 0% to caller
        assertEq(caller.balance - callerBalanceBefore, 0);

        // Full 20% to lessToken
        assertEq(lessToken.currentFees(), 0.2 ether);

        // Full 80% to team
        assertEq(team.balance - teamBalanceBefore, 0.8 ether);
    }

    /*//////////////////////////////////////////////////////////////
                            SET TEAM TESTS
    //////////////////////////////////////////////////////////////*/

    function test_setTeam_updatesTeam() public {
        vm.prank(owner);
        splitter.setTeam(newTeam);

        assertEq(splitter.team(), newTeam);
    }

    function test_setTeam_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit PayoutSplitter.TeamUpdated(newTeam);

        vm.prank(owner);
        splitter.setTeam(newTeam);
    }

    function test_setTeam_onlyOwner() public {
        vm.prank(caller);
        vm.expectRevert();
        splitter.setTeam(newTeam);
    }

    function test_setTeam_revertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PayoutSplitter.ZeroAddress.selector);
        splitter.setTeam(address(0));
    }

    function test_setTeam_splitUsesNewTeam() public {
        // Update team
        vm.prank(owner);
        splitter.setTeam(newTeam);

        // Split should go to new team
        vm.deal(address(splitter), 1 ether);
        uint256 newTeamBalanceBefore = newTeam.balance;

        vm.prank(caller);
        splitter.split();

        // 0.995 * 0.8 = 0.796 ETH to new team
        assertEq(newTeam.balance - newTeamBalanceBefore, 0.796 ether);
    }

    /*//////////////////////////////////////////////////////////////
                        OWNERSHIP TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/

    function test_transferOwnership() public {
        address newOwner = address(0x7);

        vm.prank(owner);
        splitter.transferOwnership(newOwner);

        assertEq(splitter.owner(), newOwner);
    }

    function test_newOwnerCanSetTeam() public {
        address newOwner = address(0x7);

        vm.prank(owner);
        splitter.transferOwnership(newOwner);

        vm.prank(newOwner);
        splitter.setTeam(newTeam);

        assertEq(splitter.team(), newTeam);
    }

    function test_newOwnerCanSetIncentive() public {
        address newOwner = address(0x7);

        vm.prank(owner);
        splitter.transferOwnership(newOwner);

        vm.prank(newOwner);
        splitter.setCallerIncentive(100);

        assertEq(splitter.callerIncentiveBps(), 100);
    }

    /*//////////////////////////////////////////////////////////////
                      INTEGRATION WITH LESS.SOL
    //////////////////////////////////////////////////////////////*/

    function test_integration_receivesFromForceSafeTransfer() public {
        // Simulate forceSafeTransferETH by using low-level call
        vm.deal(address(this), 1 ether);

        // This mimics what SafeTransferLib.forceSafeTransferETH does
        (bool success,) = address(splitter).call{value: 1 ether}("");
        assertTrue(success);

        assertEq(address(splitter).balance, 1 ether);
    }

    /*//////////////////////////////////////////////////////////////
                         FALLBACK TESTS
    //////////////////////////////////////////////////////////////*/

    function test_split_fallbackWhenAddFeesReverts() public {
        // Deploy splitter with reverting lessToken
        RevertingLessToken revertingToken = new RevertingLessToken();
        PayoutSplitter revertingSplitter = new PayoutSplitter(
            address(revertingToken),
            team,
            owner
        );

        // Send 1 ETH to splitter
        vm.deal(address(revertingSplitter), 1 ether);
        uint256 callerBalanceBefore = caller.balance;
        uint256 teamBalanceBefore = team.balance;

        // Split should succeed, sending lessToken's share to team
        vm.prank(caller);
        revertingSplitter.split();

        // Caller still gets 0.5%
        assertEq(caller.balance - callerBalanceBefore, 0.005 ether);

        // Team gets remaining 99.5% (lessToken's share + team's share)
        assertEq(team.balance - teamBalanceBefore, 0.995 ether);

        // Splitter balance should be 0
        assertEq(address(revertingSplitter).balance, 0);
    }

    function test_split_fallbackEmitsEvents() public {
        // Deploy splitter with reverting lessToken
        RevertingLessToken revertingToken = new RevertingLessToken();
        PayoutSplitter revertingSplitter = new PayoutSplitter(
            address(revertingToken),
            team,
            owner
        );

        vm.deal(address(revertingSplitter), 1 ether);

        // Should emit LessTokenCallFailed with the amount that would have gone to lessToken
        vm.expectEmit(true, true, true, true);
        emit PayoutSplitter.LessTokenCallFailed(0.199 ether);

        // Should emit Split with 0 to lessToken and remaining to team
        vm.expectEmit(true, true, true, true);
        emit PayoutSplitter.Split(0.005 ether, 0, 0.995 ether);

        vm.prank(caller);
        revertingSplitter.split();
    }

    function test_split_fallbackFuzz(uint256 amount) public {
        amount = bound(amount, 1000, 1000 ether);

        // Deploy splitter with reverting lessToken
        RevertingLessToken revertingToken = new RevertingLessToken();
        PayoutSplitter revertingSplitter = new PayoutSplitter(
            address(revertingToken),
            team,
            owner
        );

        vm.deal(address(revertingSplitter), amount);
        uint256 callerBalanceBefore = caller.balance;
        uint256 teamBalanceBefore = team.balance;

        vm.prank(caller);
        revertingSplitter.split();

        uint256 expectedToCaller = (amount * 50) / 10000;
        uint256 remaining = amount - expectedToCaller;

        // Caller gets incentive, team gets everything else
        assertEq(caller.balance - callerBalanceBefore, expectedToCaller);
        assertEq(team.balance - teamBalanceBefore, remaining);
        assertEq(address(revertingSplitter).balance, 0);
    }
}
