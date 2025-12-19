// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Less} from "../contracts/Less.sol";
import {LessRenderer} from "../contracts/LessRenderer.sol";
import {Base64} from "solady/utils/Base64.sol";

/// @dev Mock strategy for preview generation
contract MockStrategy {
    uint256 public timeBetweenBurn = 90 minutes;
    uint256 public lastBurn;
    uint256 public totalSupply = 1_000_000_000 ether;

    function processTokenTwap() external {
        lastBurn = block.timestamp;
        totalSupply = totalSupply * 99 / 100;
    }

    function timeUntilFundsMoved() external view returns (uint256) {
        return 0;
    }
}

/// @dev Simple scripty builder that creates viewable HTML
contract PreviewScriptyBuilder {
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

    // This will be set to the actual fold visualization script
    string public script;

    function setScript(string memory _script) external {
        script = _script;
    }

    function getEncodedHTMLString(HTMLRequest memory req)
        external
        view
        returns (string memory)
    {
        bytes memory html = abi.encodePacked(
            "<!DOCTYPE html><html><head>",
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width,initial-scale=1">',
            "<style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;width:100%;overflow:hidden;background:#000}</style>"
        );

        // Add head tags (includes seed injection)
        for (uint256 i = 0; i < req.headTags.length; i++) {
            html = abi.encodePacked(
                html,
                req.headTags[i].tagOpen,
                req.headTags[i].tagContent,
                req.headTags[i].tagClose
            );
        }

        html = abi.encodePacked(html, "</head><body>");

        // Add the main visualization script if set
        if (bytes(script).length > 0) {
            html = abi.encodePacked(
                html,
                "<script>",
                script,
                "</script>"
            );
        } else {
            // Fallback: simple visualization showing seed
            html = abi.encodePacked(
                html,
                "<canvas id='c'></canvas>",
                "<script>",
                "const c=document.getElementById('c');",
                "c.width=window.innerWidth;c.height=window.innerHeight;",
                "const ctx=c.getContext('2d');",
                "const seed=window.LESS_SEED;",
                "const id=window.LESS_TOKEN_ID;",
                // Simple seeded random
                "let s=parseInt(seed.slice(2,10),16);",
                "const rand=()=>{s=s*1103515245+12345&0x7fffffff;return s/0x7fffffff};",
                // Draw fold lines based on seed
                "ctx.strokeStyle='#fff';ctx.lineWidth=1;",
                "const folds=5+Math.floor(rand()*10);",
                "for(let i=0;i<folds;i++){",
                "ctx.beginPath();",
                "const x1=rand()*c.width,y1=rand()*c.height;",
                "const x2=rand()*c.width,y2=rand()*c.height;",
                "ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();",
                "}",
                // Show info
                "ctx.fillStyle='#666';ctx.font='12px monospace';",
                "ctx.fillText('Token #'+id+' | Seed: '+seed.slice(0,18)+'...',10,c.height-10);",
                "</script>"
            );
        }

        html = abi.encodePacked(html, "</body></html>");

        return Base64.encode(html);
    }
}

contract GeneratePreviewScript is Script {
    function run() external {
        // Deploy mock contracts
        MockStrategy strategy = new MockStrategy();
        PreviewScriptyBuilder scriptyBuilder = new PreviewScriptyBuilder();

        Less less = new Less(
            address(strategy),
            0.001 ether,
            address(this),
            address(this),
            90 minutes
        );

        LessRenderer renderer = new LessRenderer(
            LessRenderer.RendererConfig({
                less: address(less),
                scriptyBuilder: address(scriptyBuilder),
                scriptyStorage: address(0),
                scriptName: "less",
                baseImageURL: "https://less.art/images/",
                collectionName: "LESS",
                description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
                collectionImage: "https://less.art/images/collection.png",
                externalLink: "https://less.art",
                owner: address(this)
            })
        );

        less.setRenderer(address(renderer));

        // Generate tokens across multiple folds
        uint256 numFolds = 10;
        console.log("Generating previews for", numFolds, "folds...");
        console.log("");

        for (uint256 fold = 1; fold <= numFolds; fold++) {
            vm.roll(block.number + 1);
            less.createWindow();

            // Mint one token per fold
            address minter = address(uint160(0x1000 + fold));
            vm.deal(minter, 1 ether);
            vm.prank(minter);
            less.mint{value: 0.001 ether}(1);

            uint256 tokenId = less.totalSupply();
            bytes32 seed = less.getSeed(tokenId);

            console.log("--- Fold", fold, "---");
            console.log("Token ID:", tokenId);
            console.logBytes32(seed);

            // Get the tokenURI
            string memory uri = less.tokenURI(tokenId);

            // Log just the first part (the full URI is too long for console)
            console.log("URI generated (data:application/json;base64,...)");
            console.log("");

            // Fast forward for next fold
            vm.warp(block.timestamp + 91 minutes);
        }

        console.log("=== Preview HTML (Token 1) ===");
        console.log("Copy the tokenURI and decode the base64 JSON to get animation_url");
        console.log("");

        // Output full URI for token 1
        string memory fullUri = less.tokenURI(1);
        console.log(fullUri);
    }
}
