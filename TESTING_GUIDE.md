13911
71273

# Testing and Generating Onchain Outputs with Foundry

This guide covers how to test and generate onchain outputs (like NFT metadata, token URIs, and visualizations) using Foundry.

## Quick Start - Essential Commands

### Starting Local Fork Server

```bash
# Start a local Anvil fork node (run in a separate terminal)
source .env && anvil --fork-url $MAINNET_RPC_URL
```

### Running Tests

```bash
# Run all tests
forge test

# Run with verbose output (shows console.log)
forge test -vvv

# Run specific test file
forge test --match-path test/LessIntegration.t.sol

# Run specific test function
forge test --match-test test_FullLifecycle

# Run fork tests (requires MAINNET_RPC_URL)
forge test --match-contract LessFork --fork-url $MAINNET_RPC_URL -vvv
```

### Generating Outputs

```bash
# Generate previews (simulation)
# Note: Use --tc to specify contract name if file has multiple contracts
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv

# Save output to file
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv > output.txt

# Run test and save output
forge test --match-test test_OutputSampleMetadata -vvv > test_output.txt
```

### Common Workflows

```bash
# Test everything with full output
forge test -vvvv

# Generate token previews
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv

# Test against mainnet fork
forge test --match-contract LessFork --fork-url $MAINNET_RPC_URL --fork-block-number 21382000 -vvv

# Format code
forge fmt

# Build contracts
forge build
```

### Output Verbosity Levels

- `-v` - Basic test results
- `-vv` - Include logs
- `-vvv` - Include traces (recommended for debugging)
- `-vvvv` - Include setup traces
- `-vvvvv` - Maximum verbosity + gas reports

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Generating Onchain Outputs](#generating-onchain-outputs)
6. [Fork Testing](#fork-testing)
7. [Best Practices](#best-practices)
8. [Common Patterns](#common-patterns)

## Prerequisites

### Environment Setup

1. **Install Foundry** (if not already installed):

   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Set up environment variables**:
   Create a `.env` file based on `.env.example`:

   ```bash
   cp .env.example .env
   ```

   Required variables:

   - `MAINNET_RPC_URL` - For fork testing
   - `SEPOLIA_RPC_URL` - For testnet deployments
   - `ETHERSCAN_API_KEY` - For contract verification

3. **Install dependencies**:
   ```bash
   forge install
   ```

## Project Structure

```
.
├── contracts/          # Main contract source files
├── test/              # Test files (*.t.sol)
├── script/            # Deployment and utility scripts (*.s.sol)
├── foundry.toml       # Foundry configuration
└── lib/               # External dependencies
```

### Foundry Configuration

The `foundry.toml` defines:

- **Default profile**: Standard compilation and testing
- **Fork profile**: For testing against mainnet state
- **RPC endpoints**: For network interactions
- **Etherscan config**: For contract verification

## Running Tests

### Basic Test Execution

Run all tests:

```bash
forge test
```

Run with verbose output:

```bash
forge test -vvv
```

Run a specific test file:

```bash
forge test --match-path test/LessIntegration.t.sol
```

Run a specific test function:

```bash
forge test --match-test test_FullLifecycle
```

### Test Output Levels

- `-v` - Show test results
- `-vv` - Show test results and logs
- `-vvv` - Show test results, logs, and traces
- `-vvvv` - Show test results, logs, traces, and setup traces
- `-vvvvv` - Show everything including gas reports

### Filtering Tests

By contract name:

```bash
forge test --match-contract LessIntegrationTest
```

By test name pattern:

```bash
forge test --match-test "test_*Output*"
```

## Writing Tests

### Basic Test Structure

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {YourContract} from "../contracts/YourContract.sol";

contract YourTest is Test {
    YourContract public contract;

    function setUp() public {
        // Deploy contracts, set up state
        contract = new YourContract();
    }

    function test_Example() public {
        // Your test logic
        assertEq(contract.value(), expectedValue);
    }
}
```

### Outputting Data

#### Using `console.log`

```solidity
import {console} from "forge-std/console.sol";

function test_OutputData() public {
    uint256 value = 123;
    console.log("Value:", value);
    console.log("Address:", address(this));
    console.logBytes32(seed);
}
```

#### Using `emit log_*`

```solidity
function test_OutputWithEmit() public {
    emit log_named_uint("Token ID", tokenId);
    emit log_named_bytes32("Seed", seed);
    emit log_string("Full URI:", uri);
    emit log("=== Section Header ===");
}
```

### Manipulating Blockchain State

#### Time Manipulation

```solidity
// Fast forward time
vm.warp(block.timestamp + 1 days);

// Rewind time
vm.warp(block.timestamp - 1 hours);
```

#### Block Number Manipulation

```solidity
// Advance block number (affects blockhash)
vm.roll(block.number + 1);
vm.roll(block.number + 10);
```

#### Account Manipulation

```solidity
// Give ETH to an address
vm.deal(address(0x1234), 10 ether);

// Impersonate an address
vm.prank(address(0x1234));
contract.functionCall();

// Start prank session
vm.startPrank(address(0x1234));
contract.function1();
contract.function2();
vm.stopPrank();
```

### Mock Contracts

Create mock contracts for testing:

```solidity
contract MockStrategy {
    uint256 public totalSupply = 1_000_000_000 ether;

    function processTokenTwap() external {
        totalSupply = totalSupply * 99 / 100;
    }

    function timeUntilFundsMoved() external view returns (uint256) {
        return 0;
    }
}
```

## Generating Onchain Outputs

### Using Foundry Scripts

Scripts are located in `script/` and use the `Script` contract from `forge-std`.

#### Running Scripts

**Local execution** (simulation):

```bash
# If script file has multiple contracts, specify with --tc
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv
```

**Broadcast to network** (requires private key):

```bash
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript --rpc-url sepolia --broadcast
```

**With environment variables**:

```bash
source .env
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv
```

> **Note**: If your script file contains multiple contracts, Foundry requires you to specify which contract to run using `--tc ContractName`. The contract must have a `run()` function that extends `Script`.

### Example: Generating Token Previews

The `GeneratePreview.s.sol` script demonstrates:

1. **Deploying mock contracts**:

   ```solidity
   MockStrategy strategy = new MockStrategy();
   Less less = new Less(address(strategy), 0.01 ether, payout, owner);
   ```

2. **Simulating multiple folds**:

   ```solidity
   for (uint256 fold = 1; fold <= numFolds; fold++) {
       vm.roll(block.number + 1);
       less.createFold();

       // Mint tokens
       less.mint{value: 0.01 ether}();

       // Get outputs
       uint256 tokenId = less.totalSupply();
       bytes32 seed = less.getSeed(tokenId);
       string memory uri = less.tokenURI(tokenId);

       console.log("Token ID:", tokenId);
       console.logBytes32(seed);
   }
   ```

3. **Outputting full URIs**:
   ```solidity
   string memory fullUri = less.tokenURI(1);
   console.log(fullUri);
   ```

### Extracting Outputs from Scripts

Run script and save output:

```bash
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv > output.txt
```

Parse JSON from tokenURI:

```bash
# TokenURI format: data:application/json;base64,<base64-encoded-json>
# Decode the base64 portion to get the JSON metadata
```

## Fork Testing

Fork testing allows you to test against real mainnet state.

### Configuration

In `foundry.toml`:

```toml
[profile.fork]
eth_rpc_url = "${MAINNET_RPC_URL}"
fork_block_number = 21382000
```

### Running Fork Tests

```bash
forge test --match-contract LessFork --fork-url $MAINNET_RPC_URL --fork-block-number 21382000 -vvv
```

Or use the fork profile:

```bash
forge test --profile fork --match-contract LessFork -vvv
```

### Fork Test Example

```solidity
contract LessForkTest is Test {
    address constant STRATEGY = 0x32F223E5c09878823934a8116f289bAE2b657B8e;

    function setUp() public {
        require(block.chainid == 1, "Must run on mainnet fork");
        // Deploy contracts pointing to real strategy
    }

    function test_Fork_ReadStrategyData() public view {
        IRecursiveStrategy strategy = IRecursiveStrategy(STRATEGY);
        uint256 supply = strategy.totalSupply();
        console.log("Total Supply:", supply / 1e18);
    }
}
```

### Mocking External Calls in Forks

Sometimes you need to mock external contract calls:

```solidity
function test_Fork_SimulatedFlow() public {
    // Mock a function call to always succeed
    vm.mockCall(
        STRATEGY,
        abi.encodeWithSignature("processTokenTwap()"),
        abi.encode()
    );

    // Now your code can proceed
    less.createFold();
}
```

## Best Practices

### 1. Organize Tests by Purpose

- **Unit tests** (`Less.t.sol`): Test individual functions
- **Integration tests** (`LessIntegration.t.sol`): Test full workflows
- **Visual tests** (`LessVisual.t.sol`): Generate outputs for inspection
- **Fork tests** (`LessFork.t.sol`): Test against real contracts

### 2. Use Descriptive Test Names

```solidity
// Good
function test_FullLifecycle_MultipleFolds_VaryingMints() public

// Bad
function test1() public
```

### 3. Output Structured Data

```solidity
function test_OutputSampleMetadata() public {
    console.log("=== Token Metadata Samples ===");

    for (uint256 t = 1; t <= 3; t++) {
        console.log("");
        console.log("--- Token", t, "---");
        console.log("Fold ID:", data.foldId);
        console.logBytes32(data.seed);
        console.log("Strategy Block:", fold.strategyBlock);
    }
}
```

### 4. Test Edge Cases

```solidity
function test_FoldFailsWhenStrategyNotReady() public {
    // Use up all ETH
    less.createFold();

    vm.warp(block.timestamp + 31 minutes);

    // Should fail
    vm.expectRevert(RealisticMockStrategy.NoETHToTwap.selector);
    less.createFold();
}
```

### 5. Verify Seed Uniqueness

```solidity
function test_SeedDistribution() public {
    bytes32[] memory seeds = new bytes32[](50);
    // ... collect seeds ...

    // Verify all unique
    for (uint256 i = 0; i < seeds.length; i++) {
        for (uint256 j = i + 1; j < seeds.length; j++) {
            assertTrue(seeds[i] != seeds[j], "Seeds should be unique");
        }
    }
}
```

## Common Patterns

### Pattern 1: Multi-Fold Simulation

```solidity
function test_MultiFoldSimulation() public {
    uint256 numFolds = 10;

    for (uint256 fold = 1; fold <= numFolds; fold++) {
        // Advance block for unique blockhash
        vm.roll(block.number + 5);

        // Prepare strategy state
        strategy.addETH{value: 0.5 ether}();

        // Create fold
        less.createFold();

        // Mint tokens
        for (uint256 m = 0; m < mintsPerFold; m++) {
            address minter = address(uint160(userCounter++));
            vm.deal(minter, 1 ether);
            vm.prank(minter);
            less.mint{value: MINT_PRICE}();
        }

        // Fast forward past window
        vm.warp(block.timestamp + 31 minutes);
    }
}
```

### Pattern 2: Collecting and Analyzing Outputs

```solidity
function test_CollectSeeds() public {
    bytes32[] memory seeds = new bytes32[](50);
    uint256 idx = 0;

    // Generate tokens and collect seeds
    for (uint256 f = 0; f < 10; f++) {
        less.createFold();
        for (uint256 m = 0; m < 5; m++) {
            less.mint{value: MINT_PRICE}();
            seeds[idx++] = less.getSeed(less.totalSupply());
        }
    }

    // Analyze
    console.log("Total seeds:", seeds.length);
    // ... analysis logic ...
}
```

### Pattern 3: Output Full Metadata

```solidity
function test_OutputFullMetadata() public {
    less.createFold();
    less.mint{value: MINT_PRICE}();

    uint256 tokenId = 1;
    Less.TokenData memory data = less.getTokenData(tokenId);
    Less.Fold memory fold = less.getFold(data.foldId);

    console.log("=== Token Data ===");
    console.log("Token ID:", tokenId);
    console.log("Fold ID:", data.foldId);
    console.logBytes32(data.seed);
    console.log("Strategy Block:", fold.strategyBlock);

    string memory uri = less.tokenURI(tokenId);
    console.log("=== Full Token URI ===");
    console.log(uri);
}
```

### Pattern 4: Testing with Realistic State

```solidity
contract RealisticMockStrategy {
    uint256 public totalSupply = 1_000_000_000 ether;
    uint256 public ethToTwap;
    uint256 public lastBurn;

    function processTokenTwap() external {
        // Simulate realistic behavior
        uint256 burnAmount = totalSupply / 1000; // 0.1%
        totalSupply -= burnAmount;
        ethToTwap -= 0.1 ether;
        lastBurn = block.timestamp;
    }
}
```

## Debugging Tips

### 1. Use Verbose Output

```bash
forge test -vvvv
```

### 2. Add Breakpoints (with debugger)

```bash
forge test --debug test_Example
```

### 3. Inspect State Changes

```solidity
function test_StateInspection() public {
    uint256 before = contract.value();
    contract.doSomething();
    uint256 after = contract.value();

    console.log("Before:", before);
    console.log("After:", after);
    console.log("Delta:", after - before);
}
```

### 4. Test Individual Components

Create focused tests for specific functions:

```solidity
function test_SeedGeneration() public {
    bytes32 seed1 = less.getSeed(1);
    bytes32 seed2 = less.getSeed(2);
    assertTrue(seed1 != seed2);
}
```

## Extracting and Using Outputs

### From Test Output

1. Run test with verbose logging:

   ```bash
   forge test --match-test test_OutputSampleMetadata -vvv > test_output.txt
   ```

2. Extract token URIs from output

3. Decode base64 JSON:
   ```bash
   # TokenURI: data:application/json;base64,<encoded>
   # Extract the base64 part and decode
   echo "<base64-string>" | base64 -d > metadata.json
   ```

### From Script Output

1. Run script:

```bash
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv > script_output.txt
```

2. Parse the console.log output

3. Extract URIs and decode as needed

### Viewing HTML Outputs

Token URIs often contain HTML in the `animation_url` field:

1. Extract the `animation_url` from decoded JSON
2. It's typically base64 encoded: `data:text/html;base64,<html>`
3. Decode to get the HTML
4. Save to `.html` file and open in browser

## Troubleshooting

### Common Issues

1. **"Must run on mainnet fork" error**:

   - Ensure you're using `--fork-url` flag
   - Check your RPC URL is valid

2. **Out of gas errors**:

   - Increase gas limit: `forge test --gas-limit 100000000`
   - Optimize your test logic

3. **Console.log not showing**:

   - Use `-vv` or higher verbosity
   - Check you're importing `console` correctly

4. **Blockhash not changing**:

   - Use `vm.roll()` to advance block number
   - Blockhash only changes every 256 blocks

5. **"Multiple contracts in the target path" error**:
   - Script files with multiple contracts need `--tc ContractName`
   - Example: `forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv`
   - The contract name must be the one with the `run()` function

## Additional Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [Forge Reference](https://book.getfoundry.sh/reference/forge/forge-test)
- [Cheatcodes Reference](https://book.getfoundry.sh/cheatcodes/)

## Example Commands Cheat Sheet

```bash
# Run all tests
forge test

# Run with full output
forge test -vvvv

# Run specific test
forge test --match-test test_FullLifecycle

# Run fork tests
forge test --match-contract LessFork --fork-url $MAINNET_RPC_URL

# Run script
forge script script/GeneratePreview.s.sol --tc GeneratePreviewScript -vvv

# Format code
forge fmt

# Build contracts
forge build

# Get gas report
forge test --gas-report
```
