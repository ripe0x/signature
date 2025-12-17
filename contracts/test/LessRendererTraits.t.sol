// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {LessRenderer} from "../LessRenderer.sol";

/// @title LessRendererTraitsHarness
/// @notice Exposes internal trait derivation functions for testing
contract LessRendererTraitsHarness is LessRenderer {
    constructor()
        LessRenderer(
            RendererConfig({
                less: address(1),
                scriptyBuilder: address(2),
                scriptyStorage: address(3),
                scriptName: "test",
                baseImageURL: "https://test.com/",
                collectionName: "LESS",
                description: "LESS is a networked generative artwork about subtraction. what remains when a system keeps taking things away.",
                collectionImage: "https://test.com/collection.png",
                externalLink: "https://test.com",
                owner: address(this)
            })
        )
    {}

    // Expose internal functions for testing
    function seedToNumber(bytes32 seed) external pure returns (uint256) {
        return _seedToNumber(seed);
    }

    function getFoldStrategy(bytes32 seed) external pure returns (string memory) {
        return _getFoldStrategy(seed);
    }

    function getRenderMode(bytes32 seed) external pure returns (string memory) {
        return _getRenderMode(seed);
    }

    function getDrawDirection(bytes32 seed) external pure returns (string memory) {
        return _getDrawDirection(seed);
    }

    function getPalette(bytes32 seed) external pure returns (
        string memory strategy,
        uint8 colorCount,
        bool isMonochrome
    ) {
        return _getPalette(seed);
    }

    function getPaperType(bytes32 seed) external pure returns (string memory) {
        return _getPaperType(seed);
    }

    function hasPaperGrain(bytes32 seed) external pure returns (bool) {
        return _hasPaperGrain(seed);
    }

    function hasCreaseLines(bytes32 seed) external pure returns (bool) {
        return _hasCreaseLines(seed);
    }

    function hasHitCounts(bytes32 seed) external pure returns (bool) {
        return _hasHitCounts(seed);
    }
}

/// @title LessRendererTraitsTest
/// @notice Tests that Solidity trait derivation matches JavaScript implementation
/// @dev Uses full 256-bit seeds (like from keccak256) for realistic testing
contract LessRendererTraitsTest is Test {
    LessRendererTraitsHarness public harness;

    // Test seeds - full 256-bit values like from keccak256
    bytes32 constant SEED_0 = bytes32(uint256(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef));
    bytes32 constant SEED_1 = bytes32(uint256(0xdeadbeefcafebabe0000000000000000ffffffffffffffffffffffffffffffff));
    bytes32 constant SEED_2 = bytes32(uint256(0xa5a5a5a5a5a5a5a5b6b6b6b6b6b6b6b6c7c7c7c7c7c7c7c7d8d8d8d8d8d8d8d8));
    bytes32 constant SEED_3 = bytes32(uint256(0x0000000000000001ffffffffffffffffffffffffffffffffffffffffffffffff));
    bytes32 constant SEED_4 = bytes32(uint256(0x7fffffffffffffffaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0));
    bytes32 constant SEED_5 = bytes32(uint256(0x8000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0));
    bytes32 constant SEED_6 = bytes32(uint256(0xffffffffffffffff000000000000000000000000000000000000000000000000));
    bytes32 constant SEED_7 = bytes32(uint256(0x0fedcba987654321111111111111111122222222222222223333333333333333));

    // Special seeds that produce rare traits
    bytes32 constant SEED_MONO = bytes32(uint256(0x1400000000000000000000000000000000000000000000000000000000000000));
    bytes32 constant SEED_CREASE = bytes32(uint256(0x3900000000000000000000000000000000000000000000000000000000000000));
    bytes32 constant SEED_HITCOUNT = bytes32(uint256(0x3a00000000000000000000000000000000000000000000000000000000000000));

    function setUp() public {
        harness = new LessRendererTraitsHarness();
    }

    /// @notice Test seedToNumber conversion matches JS hexSeedToNumber
    function test_SeedToNumber_MatchesJS() public view {
        // JS: hexSeedToNumber takes upper 64 bits and mods by 0x7fffffff
        assertEq(harness.seedToNumber(SEED_0), 890534624, "seed 0");
        assertEq(harness.seedToNumber(SEED_1), 140130465, "seed 1");
        assertEq(harness.seedToNumber(SEED_2), 1894838514, "seed 2");
        assertEq(harness.seedToNumber(SEED_3), 1, "seed 3");
        assertEq(harness.seedToNumber(SEED_4), 1, "seed 4"); // 0x7fffffffffffffff % 0x7fffffff = 1
        assertEq(harness.seedToNumber(SEED_5), 2, "seed 5");
        assertEq(harness.seedToNumber(SEED_6), 3, "seed 6"); // 0xffffffffffffffff % 0x7fffffff = 3
        assertEq(harness.seedToNumber(SEED_7), 658561652, "seed 7");
    }

    /// @notice Test fold strategy derivation matches JS
    function test_FoldStrategy_MatchesJS() public view {
        assertEq(harness.getFoldStrategy(SEED_0), "Random", "seed 0");
        assertEq(harness.getFoldStrategy(SEED_1), "Random", "seed 1");
        assertEq(harness.getFoldStrategy(SEED_2), "Horizontal", "seed 2");
        assertEq(harness.getFoldStrategy(SEED_3), "Random", "seed 3");
        assertEq(harness.getFoldStrategy(SEED_4), "Random", "seed 4");
        assertEq(harness.getFoldStrategy(SEED_5), "Radial", "seed 5");
        assertEq(harness.getFoldStrategy(SEED_6), "Random", "seed 6");
        assertEq(harness.getFoldStrategy(SEED_7), "Vertical", "seed 7");
    }

    /// @notice Test render mode derivation matches JS
    function test_RenderMode_MatchesJS() public view {
        assertEq(harness.getRenderMode(SEED_0), "Normal", "seed 0");
        assertEq(harness.getRenderMode(SEED_1), "Dense", "seed 1");
        assertEq(harness.getRenderMode(SEED_2), "Normal", "seed 2");
        assertEq(harness.getRenderMode(SEED_3), "Normal", "seed 3");
        assertEq(harness.getRenderMode(SEED_4), "Normal", "seed 4");
        assertEq(harness.getRenderMode(SEED_5), "Inverted", "seed 5");
        assertEq(harness.getRenderMode(SEED_6), "Normal", "seed 6");
        assertEq(harness.getRenderMode(SEED_7), "Normal", "seed 7");
    }

    /// @notice Test draw direction derivation matches JS
    function test_DrawDirection_MatchesJS() public view {
        assertEq(harness.getDrawDirection(SEED_0), "Left to Right", "seed 0");
        assertEq(harness.getDrawDirection(SEED_1), "Left to Right", "seed 1");
        assertEq(harness.getDrawDirection(SEED_2), "Right to Left", "seed 2");
        assertEq(harness.getDrawDirection(SEED_3), "Left to Right", "seed 3");
        assertEq(harness.getDrawDirection(SEED_4), "Left to Right", "seed 4");
        assertEq(harness.getDrawDirection(SEED_5), "Alternate", "seed 5");
        assertEq(harness.getDrawDirection(SEED_6), "Left to Right", "seed 6");
        assertEq(harness.getDrawDirection(SEED_7), "Right to Left", "seed 7");
    }

    /// @notice Test palette derivation matches JS (BigInt version)
    function test_Palette_MatchesJS() public view {
        // Seed 0: complement, 3 colors
        (string memory strat0, uint8 count0, bool mono0) = harness.getPalette(SEED_0);
        assertEq(strat0, "Complement", "seed 0 strategy");
        assertEq(count0, 3, "seed 0 colorCount");
        assertFalse(mono0, "seed 0 mono");

        // Seed 1: complement, 3 colors
        (string memory strat1, uint8 count1, bool mono1) = harness.getPalette(SEED_1);
        assertEq(strat1, "Complement", "seed 1 strategy");
        assertEq(count1, 3, "seed 1 colorCount");
        assertFalse(mono1, "seed 1 mono");

        // Seed 2: clash, 2 colors
        (string memory strat2, uint8 count2, bool mono2) = harness.getPalette(SEED_2);
        assertEq(strat2, "Clash", "seed 2 strategy");
        assertEq(count2, 2, "seed 2 colorCount");
        assertFalse(mono2, "seed 2 mono");

        // Seed 5: monochrome, 2 colors
        (string memory strat5, uint8 count5, bool mono5) = harness.getPalette(SEED_5);
        assertEq(strat5, "Monochrome", "seed 5 strategy");
        assertEq(count5, 2, "seed 5 colorCount");
        assertTrue(mono5, "seed 5 mono");
    }

    /// @notice Test paper type derivation matches JS
    function test_PaperType_MatchesJS() public view {
        assertEq(harness.getPaperType(SEED_0), "Resistant", "seed 0");
        assertEq(harness.getPaperType(SEED_1), "Absorbent", "seed 1");
        assertEq(harness.getPaperType(SEED_2), "Resistant", "seed 2");
        assertEq(harness.getPaperType(SEED_3), "Resistant", "seed 3");
        assertEq(harness.getPaperType(SEED_4), "Resistant", "seed 4");
        assertEq(harness.getPaperType(SEED_5), "Standard", "seed 5");
        assertEq(harness.getPaperType(SEED_6), "Resistant", "seed 6");
        assertEq(harness.getPaperType(SEED_7), "Resistant", "seed 7");
    }

    /// @notice Test paper grain derivation matches JS (BigInt version)
    function test_PaperGrain_MatchesJS() public view {
        assertFalse(harness.hasPaperGrain(SEED_0), "seed 0");
        assertTrue(harness.hasPaperGrain(SEED_1), "seed 1"); // BigInt: true
        assertFalse(harness.hasPaperGrain(SEED_2), "seed 2");
        assertFalse(harness.hasPaperGrain(SEED_3), "seed 3");
        assertFalse(harness.hasPaperGrain(SEED_4), "seed 4");
        assertFalse(harness.hasPaperGrain(SEED_5), "seed 5"); // BigInt: false
        assertFalse(harness.hasPaperGrain(SEED_6), "seed 6");
        assertFalse(harness.hasPaperGrain(SEED_7), "seed 7");
    }

    /// @notice Test that standard test seeds don't produce rare traits
    function test_RareTraits_StandardSeeds() public view {
        bytes32[8] memory seeds = [SEED_0, SEED_1, SEED_2, SEED_3, SEED_4, SEED_5, SEED_6, SEED_7];

        for (uint256 i = 0; i < seeds.length; i++) {
            assertFalse(harness.hasCreaseLines(seeds[i]), "creaseLines should be false");
            assertFalse(harness.hasHitCounts(seeds[i]), "hitCounts should be false");
        }
    }

    /// @notice Test that special seeds produce monochrome palette
    function test_MonochromeSeed() public view {
        (string memory strategy, uint8 colorCount, bool isMonochrome) = harness.getPalette(SEED_MONO);
        assertEq(strategy, "Monochrome", "strategy should be monochrome");
        assertEq(colorCount, 2, "monochrome should have 2 colors");
        assertTrue(isMonochrome, "isMonochrome should be true");
    }

    /// @notice Test that special seed produces crease lines
    function test_CreaseLinesSeed() public view {
        assertTrue(harness.hasCreaseLines(SEED_CREASE), "should have crease lines");
    }

    /// @notice Test that special seed produces hit counts
    function test_HitCountsSeed() public view {
        assertTrue(harness.hasHitCounts(SEED_HITCOUNT), "should have hit counts");
    }

    /// @notice Verify the monochrome seed (SEED_5) traits
    function test_Seed5_Monochrome() public view {
        (string memory strategy, , bool isMonochrome) = harness.getPalette(SEED_5);
        assertEq(strategy, "Monochrome", "should be monochrome");
        assertTrue(isMonochrome, "isMonochrome should be true");
        assertFalse(harness.hasPaperGrain(SEED_5), "should not have grain"); // BigInt: false
        assertEq(harness.getFoldStrategy(SEED_5), "Radial", "fold strategy should be radial");
        assertEq(harness.getRenderMode(SEED_5), "Inverted", "render mode should be inverted");
    }

    /// @notice Test a seed that has paper grain
    function test_PaperGrainSeed() public view {
        // 0x1300... has paper grain
        bytes32 grainSeed = bytes32(uint256(0x1300000000000000000000000000000000000000000000000000000000000000));
        assertTrue(harness.hasPaperGrain(grainSeed), "should have paper grain");
    }
}
