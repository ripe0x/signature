// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "solady/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

interface ILessToken {
    function addFeesManual() external payable;
}

/// @title PayoutSplitter
/// @notice Splits incoming ETH: 20% to $LESS token, ~79.5% to team, 0.5% to caller
/// @dev Set this contract as payoutRecipient on Less.sol
contract PayoutSplitter is Ownable, ReentrancyGuard {
    /// @notice The upgraded $LESS token contract that receives 20%
    address public immutable lessToken;

    /// @notice The team address that receives remainder after lessToken and caller
    address public team;

    /// @notice Caller incentive in basis points (50 = 0.5%)
    uint256 public callerIncentiveBps;

    /// @notice Emitted when ETH is split and distributed
    event Split(uint256 toCaller, uint256 toLessToken, uint256 toTeam);

    /// @notice Emitted when addFeesManual() fails and funds go to team instead
    event LessTokenCallFailed(uint256 amount);

    /// @notice Emitted when the team address is updated
    event TeamUpdated(address newTeam);

    /// @notice Emitted when the caller incentive is updated
    event CallerIncentiveUpdated(uint256 newBps);

    error ZeroAddress();
    error NoBalance();
    error IncentiveTooHigh();

    constructor(address _lessToken, address _team, address _owner) {
        if (_lessToken == address(0)) revert ZeroAddress();
        if (_team == address(0)) revert ZeroAddress();
        if (_owner == address(0)) revert ZeroAddress();

        lessToken = _lessToken;
        team = _team;
        callerIncentiveBps = 50; // 0.5% default
        _initializeOwner(_owner);
    }

    /// @notice Receive ETH from Less.sol withdraw()
    receive() external payable {}

    /// @notice Split and distribute the contract's ETH balance
    /// @dev Anyone can call this to trigger the split.
    ///      Pays lessToken and team first, then caller incentive last.
    ///      If addFeesManual() fails, lessToken's share goes to team instead.
    function split() external nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalance();

        // Calculate caller incentive
        uint256 toCaller = (balance * callerIncentiveBps) / 10000;
        uint256 remaining = balance - toCaller;

        // Calculate split: 20% of remaining to $LESS token, rest to team
        uint256 toLessToken = remaining / 5; // 20%
        uint256 toTeam = remaining - toLessToken; // 80%

        // Try to send 20% to $LESS token via addFeesManual()
        // If it fails, send lessToken's share to team instead
        try ILessToken(lessToken).addFeesManual{value: toLessToken}() {
            // Success - send 80% to team
            SafeTransferLib.forceSafeTransferETH(team, toTeam);
            emit Split(toCaller, toLessToken, toTeam);
        } catch {
            // Failed - send lessToken's share to team too
            emit LessTokenCallFailed(toLessToken);
            SafeTransferLib.forceSafeTransferETH(team, remaining);
            emit Split(toCaller, 0, remaining);
        }
        // Pay caller incentive last
        if (toCaller > 0) {
            SafeTransferLib.forceSafeTransferETH(msg.sender, toCaller);
        }
    }

    /// @notice Update the team address
    /// @param _team New team address
    function setTeam(address _team) external onlyOwner {
        if (_team == address(0)) revert ZeroAddress();
        team = _team;
        emit TeamUpdated(_team);
    }

    /// @notice Update the caller incentive
    /// @param _bps New incentive in basis points (max 1000 = 10%)
    function setCallerIncentive(uint256 _bps) external onlyOwner {
        if (_bps > 1000) revert IncentiveTooHigh();
        callerIncentiveBps = _bps;
        emit CallerIncentiveUpdated(_bps);
    }
}
