// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";

/// @dev Mock strategy for visual testing
contract MockStrategy {
    uint256 public timeBetweenBurn = 30 minutes;
    uint256 public lastBurn;
    uint256 public totalSupply = 1_000_000_000 ether;

    function timeUntilFundsMoved() external view returns (uint256) {
        if (block.timestamp <= lastBurn + timeBetweenBurn) {
            return (lastBurn + timeBetweenBurn) - block.timestamp;
        }
        return 0;
    }

    function processTokenTwap() external {
        lastBurn = block.timestamp;
        // Simulate supply reduction each burn
        totalSupply = totalSupply * 99 / 100;
    }
}

/// @dev Inline scripty builder that returns actual HTML with seed injection
contract InlineScriptyBuilder {
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

    function getEncodedHTMLString(HTMLRequest memory req)
        external
        pure
        returns (string memory)
    {
        // Build a simple HTML that displays the seed
        bytes memory html = abi.encodePacked(
            "<!DOCTYPE html><html><head>"
        );

        // Add head tags
        for (uint256 i = 0; i < req.headTags.length; i++) {
            html = abi.encodePacked(
                html,
                req.headTags[i].tagOpen,
                req.headTags[i].tagContent,
                req.headTags[i].tagClose
            );
        }

        html = abi.encodePacked(
            html,
            "</head><body>",
            "<div id='info'></div>",
            "<canvas id='canvas'></canvas>",
            "<script>",
            "document.getElementById('info').innerHTML = ",
            "'Token: ' + window.LESS_TOKEN_ID + '<br>Seed: ' + window.LESS_SEED;",
            "</script>"
        );

        // Add body tags (would include the main script in production)
        for (uint256 i = 0; i < req.bodyTags.length; i++) {
            if (bytes(req.bodyTags[i].tagContent).length > 0) {
                html = abi.encodePacked(
                    html,
                    "<script>",
                    req.bodyTags[i].tagContent,
                    "</script>"
                );
            }
        }

        html = abi.encodePacked(html, "</body></html>");

        return _base64Encode(html);
    }

    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";

        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i;
        uint256 j;

        for (i = 0; i + 3 <= len; i += 3) {
            uint256 a = uint8(data[i]);
            uint256 b = uint8(data[i + 1]);
            uint256 c = uint8(data[i + 2]);

            result[j++] = TABLE[(a >> 2) & 0x3F];
            result[j++] = TABLE[((a & 0x3) << 4) | ((b >> 4) & 0xF)];
            result[j++] = TABLE[((b & 0xF) << 2) | ((c >> 6) & 0x3)];
            result[j++] = TABLE[c & 0x3F];
        }

        if (len % 3 == 1) {
            uint256 a = uint8(data[i]);
            result[j++] = TABLE[(a >> 2) & 0x3F];
            result[j++] = TABLE[(a & 0x3) << 4];
            result[j++] = "=";
            result[j++] = "=";
        } else if (len % 3 == 2) {
            uint256 a = uint8(data[i]);
            uint256 b = uint8(data[i + 1]);
            result[j++] = TABLE[(a >> 2) & 0x3F];
            result[j++] = TABLE[((a & 0x3) << 4) | ((b >> 4) & 0xF)];
            result[j++] = TABLE[(b & 0xF) << 2];
            result[j++] = "=";
        }

        return string(result);
    }
}

contract LessVisualTest is Test {
    Less public less;
    LessRenderer public renderer;
    MockStrategy public strategy;
    InlineScriptyBuilder public scriptyBuilder;

    address public owner = address(0x1);
    address public payout = address(0x2);

    function setUp() public {
        strategy = new MockStrategy();
        scriptyBuilder = new InlineScriptyBuilder();

        vm.startPrank(owner);

        less = new Less(address(strategy), 0.01 ether, payout, owner);

        renderer = new LessRenderer(
            LessRenderer.RendererConfig({
                less: address(less),
                scriptyBuilder: address(scriptyBuilder),
                scriptyStorage: address(0),
                scriptName: "less-script",
                baseImageURL: "https://less.art/images/",
                collectionName: "LESS",
                description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
                collectionImage: "https://less.art/images/collection.png",
                externalLink: "https://less.art",
                owner: owner
            })
        );

        less.setRenderer(address(renderer));
        vm.stopPrank();
    }

    /// @notice Generate tokens across multiple folds and output their metadata
    function test_GenerateVisualOutputs() public {
        uint256 numFolds = 5;
        uint256 mintersPerFold = 3;

        for (uint256 fold = 1; fold <= numFolds; fold++) {
            // Create a new fold
            vm.roll(block.number + 1);
            vm.deal(address(strategy), 0.5 ether);
            less.createFold();

            emit log_named_uint("=== Fold", fold);

            Less.Fold memory foldData = less.getFold(fold);
            emit log_named_bytes32("  Block Hash", foldData.blockHash);
            emit log_named_uint("  Window Start", foldData.startTime);
            emit log_named_uint("  Window End", foldData.endTime);
            emit log_named_uint("  Strategy Supply", strategy.totalSupply() / 1e18);

            // Mint tokens for this fold
            for (uint256 m = 0; m < mintersPerFold; m++) {
                address minter = address(uint160(100 + fold * 10 + m));
                vm.deal(minter, 1 ether);
                vm.prank(minter);
                less.mint{value: 0.01 ether}();

                uint256 tokenId = less.totalSupply();
                bytes32 seed = less.getSeed(tokenId);

                emit log_named_uint("  Token ID", tokenId);
                emit log_named_bytes32("  Seed", seed);
            }

            // Fast forward past window for next fold
            vm.warp(block.timestamp + 31 minutes);
        }

        // Output some token URIs
        emit log("=== Sample Token URIs ===");

        // Token 1 (first fold, first mint)
        string memory uri1 = less.tokenURI(1);
        emit log_named_uint("Token", 1);
        emit log_string(uri1);

        // Token from middle fold
        uint256 midToken = (numFolds / 2) * mintersPerFold;
        string memory uriMid = less.tokenURI(midToken);
        emit log_named_uint("Token", midToken);
        emit log_string(uriMid);

        // Last token
        uint256 lastToken = less.totalSupply();
        string memory uriLast = less.tokenURI(lastToken);
        emit log_named_uint("Token", lastToken);
        emit log_string(uriLast);
    }

    /// @notice Output a single token's full metadata for inspection
    function test_SingleTokenOutput() public {
        // Create fold and mint
        vm.deal(address(strategy), 0.5 ether);
        less.createFold();

        address minter = address(0x1234);
        vm.deal(minter, 1 ether);
        vm.prank(minter);
        less.mint{value: 0.01 ether}();

        // Get all the data
        uint256 tokenId = 1;
        Less.TokenData memory tokenData = less.getTokenData(tokenId);
        Less.Fold memory fold = less.getFold(tokenData.foldId);

        emit log("=== Token Data ===");
        emit log_named_uint("Token ID", tokenId);
        emit log_named_uint("Fold ID", tokenData.foldId);
        emit log_named_bytes32("Seed", less.getSeed(tokenId));
        emit log_named_bytes32("Block Hash", fold.blockHash);
        emit log_named_uint("Window Start", fold.startTime);
        emit log_named_uint("Window End", fold.endTime);

        emit log("=== Full Token URI ===");
        string memory uri = less.tokenURI(tokenId);
        emit log_string(uri);
    }
}
