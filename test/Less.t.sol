// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";

/// @dev Mock RecursiveStrategy for testing
contract MockStrategy {
    uint256 public timeBetweenBurn = 30 minutes;
    uint256 public lastBurn;
    uint256 public totalSupply = 1_000_000_000 ether;
    bool public shouldRevert;

    function timeUntilFundsMoved() external view returns (uint256) {
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
            address(less),
            address(scriptyBuilder),
            address(0), // scriptyStorage not needed for mock
            "test-script",
            "https://example.com/less/",
            owner
        );

        less.setRenderer(address(renderer));

        vm.stopPrank();
    }

    function test_InitialState() public view {
        assertEq(less.name(), "less");
        assertEq(less.symbol(), "LESS");
        assertEq(less.currentFoldId(), 0);
        assertEq(less.totalSupply(), 0);
        assertEq(less.mintPrice(), MINT_PRICE);
        assertEq(less.payoutRecipient(), payout);
        assertEq(less.windowDuration(), 30 minutes);
    }

    function test_CreateFold() public {
        less.createFold();

        assertEq(less.currentFoldId(), 1);
        assertTrue(less.isWindowActive());

        Less.Fold memory fold = less.getFold(1);
        assertEq(fold.startTime, block.timestamp);
        assertEq(fold.endTime, block.timestamp + 30 minutes);
        assertEq(fold.strategyBlock, block.number);
    }

    function test_CreateFold_RevertIfWindowActive() public {
        less.createFold();

        vm.expectRevert(Less.MintWindowActive.selector);
        less.createFold();
    }

    function test_CreateFold_AfterWindowEnds() public {
        less.createFold();

        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
        assertFalse(less.isWindowActive());

        less.createFold();
        assertEq(less.currentFoldId(), 2);
        assertTrue(less.isWindowActive());
    }

    function test_Mint() public {
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        assertEq(less.totalSupply(), 1);
        assertEq(less.ownerOf(1), user1);
        assertEq(less.getFoldId(1), 1);
        assertTrue(less.getSeed(1) != bytes32(0));
        assertEq(payout.balance, MINT_PRICE);
    }

    function test_Mint_RevertNoActiveWindow() public {
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.NoActiveMintWindow.selector);
        less.mint{value: MINT_PRICE}();
    }

    function test_Mint_RevertAlreadyMinted() public {
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.startPrank(user1);
        less.mint{value: MINT_PRICE}();

        vm.expectRevert(Less.AlreadyMintedThisFold.selector);
        less.mint{value: MINT_PRICE}();
        vm.stopPrank();
    }

    function test_Mint_RevertInsufficientPayment() public {
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        vm.expectRevert(Less.InsufficientPayment.selector);
        less.mint{value: MINT_PRICE - 1}();
    }

    function test_Mint_MultipleUsersPerFold() public {
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
        assertEq(less.getFoldId(1), 1);
        assertEq(less.getFoldId(2), 1);
    }

    function test_Mint_SameUserDifferentFolds() public {
        // Fold 1
        less.createFold();
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        // Fast forward and create fold 2
        vm.warp(block.timestamp + 31 minutes);
        less.createFold();

        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        assertEq(less.totalSupply(), 2);
        assertEq(less.getFoldId(1), 1);
        assertEq(less.getFoldId(2), 2);
    }

    function test_TokenURI() public {
        less.createFold();

        vm.deal(user1, 1 ether);
        vm.prank(user1);
        less.mint{value: MINT_PRICE}();

        string memory uri = less.tokenURI(1);
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

        vm.stopPrank();
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
