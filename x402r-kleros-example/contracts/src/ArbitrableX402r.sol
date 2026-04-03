// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ProtocolArbitrable} from "./ProtocolArbitrable.sol";

// ---------------------------------------------------------------------------
// Minimal x402r interfaces (matching AuthCaptureEscrow ABI layout)
// ---------------------------------------------------------------------------

struct PaymentInfo {
    address operator;
    address payer;
    address receiver;
    address token;
    uint120 maxAmount;
    uint48 preApprovalExpiry;
    uint48 authorizationExpiry;
    uint48 refundExpiry;
    uint16 minFeeBps;
    uint16 maxFeeBps;
    address feeReceiver;
    uint256 salt;
}

interface IRefundRequest {
    function deny(PaymentInfo calldata paymentInfo) external;
    function refuse(PaymentInfo calldata paymentInfo) external;
}

interface IPaymentOperator {
    function refundInEscrow(PaymentInfo calldata paymentInfo, uint120 amount, bytes calldata data) external;
}

// ---------------------------------------------------------------------------
// ArbitrableX402r — bridges Kleros rulings to x402r RefundRequest
//
// Extends ProtocolArbitrable with x402r-specific dispute data and execution.
// ---------------------------------------------------------------------------

contract ArbitrableX402r is ProtocolArbitrable {
    // ── Types ───────────────────────────────────────────────────────────────

    struct X402rDisputeData {
        address refundRequest;
        bytes32 paymentInfoHash;
        uint120 refundAmount;
        bool executed;
    }

    // ── Storage ─────────────────────────────────────────────────────────────

    mapping(uint256 => X402rDisputeData) public x402rDisputes; // localDisputeID => data
    mapping(bytes32 => uint256) public refundToDispute; // dedup key => localDisputeID + 1

    // ── Events ──────────────────────────────────────────────────────────────

    event DisputeCreated(
        uint256 indexed localDisputeID,
        uint256 indexed arbitratorDisputeID,
        address indexed refundRequest,
        uint120 refundAmount
    );

    event RulingExecuted(uint256 indexed localDisputeID, uint256 ruling);

    // ── Errors ──────────────────────────────────────────────────────────────

    error OnlyPayer();
    error DuplicateDispute();
    error PaymentInfoMismatch();
    error NotRuled();
    error AlreadyExecuted();

    // ── Constructor ─────────────────────────────────────────────────────────

    constructor(address _arbitrator) ProtocolArbitrable(_arbitrator) {}

    // ── Create Dispute ──────────────────────────────────────────────────────

    /// @notice Create a Kleros dispute linked to an x402r refund request.
    ///         Must be called by the payer of the payment.
    function createDispute(
        address _refundRequest,
        PaymentInfo calldata _paymentInfo,
        uint120 _refundAmount,
        bytes calldata _extraData
    ) external payable returns (uint256 arbitratorDisputeID, uint256 localDisputeID) {
        if (msg.sender != _paymentInfo.payer) revert OnlyPayer();

        // Dedup: one dispute per (refundRequest, paymentInfoHash)
        bytes32 piHash = keccak256(abi.encode(_paymentInfo));
        bytes32 dedupKey = keccak256(abi.encode(_refundRequest, piHash));
        if (refundToDispute[dedupKey] != 0) revert DuplicateDispute();

        (arbitratorDisputeID, localDisputeID) = _createKlerosDispute(_extraData, 2);

        x402rDisputes[localDisputeID] = X402rDisputeData({
            refundRequest: _refundRequest,
            paymentInfoHash: piHash,
            refundAmount: _refundAmount,
            executed: false
        });

        refundToDispute[dedupKey] = localDisputeID + 1; // +1 to distinguish from default 0

        emit DisputeCreated(localDisputeID, arbitratorDisputeID, _refundRequest, _refundAmount);
    }

    // ── Execute Ruling ──────────────────────────────────────────────────────

    /// @notice Execute a Kleros ruling on x402r. Permissionless — anyone can call.
    ///         paymentInfo is passed as calldata (not stored) to save gas.
    function executeRuling(uint256 _localDisputeID, PaymentInfo calldata _paymentInfo) external {
        DisputeData storage d = disputes[_localDisputeID];
        if (!d.isRuled) revert NotRuled();

        X402rDisputeData storage x = x402rDisputes[_localDisputeID];
        if (x.executed) revert AlreadyExecuted();
        if (keccak256(abi.encode(_paymentInfo)) != x.paymentInfoHash) revert PaymentInfoMismatch();
        x.executed = true;

        uint256 ruling = d.ruling;

        if (ruling == 1) {
            // PayerWins — refund via operator (RefundRequest auto-records approval)
            IPaymentOperator(_paymentInfo.operator).refundInEscrow(_paymentInfo, x.refundAmount, "");
        } else if (ruling == 2) {
            // ReceiverWins — deny refund
            IRefundRequest(x.refundRequest).deny(_paymentInfo);
        } else {
            // RefusedToArbitrate (ruling == 0) — mark as refused on x402r
            IRefundRequest(x.refundRequest).refuse(_paymentInfo);
        }

        emit RulingExecuted(_localDisputeID, ruling);
    }

    // ── View ────────────────────────────────────────────────────────────────

    function getX402rDispute(uint256 _localDisputeID) external view returns (X402rDisputeData memory) {
        return x402rDisputes[_localDisputeID];
    }
}
