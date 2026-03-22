// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ---------------------------------------------------------------------------
// Minimal Kleros interfaces (zero external dependencies)
// ---------------------------------------------------------------------------

interface IArbitratorV2 {
    function createDispute(uint256 _numberOfChoices, bytes calldata _extraData)
        external
        payable
        returns (uint256 disputeID);

    function arbitrationCost(bytes calldata _extraData) external view returns (uint256 cost);

    function currentRuling(uint256 _disputeID) external view returns (uint256 ruling, bool tied, bool overridden);
}

interface IArbitrableV2 {
    function rule(uint256 _arbitratorDisputeID, uint256 _ruling) external;
}

// ---------------------------------------------------------------------------
// ProtocolArbitrable — base contract for Kleros-integrated protocols
//
// Handles dispute lifecycle (create, rule, evidence) without any protocol
// logic. Subclasses add executeRuling() to bridge rulings into their protocol.
// ---------------------------------------------------------------------------

abstract contract ProtocolArbitrable is IArbitrableV2 {
    // ── Types ───────────────────────────────────────────────────────────────

    struct DisputeData {
        bool isRuled;
        uint256 ruling;
        uint256 numberOfRulingOptions;
    }

    // ── Storage ─────────────────────────────────────────────────────────────

    IArbitratorV2 public immutable ARBITRATOR;

    DisputeData[] public disputes;
    mapping(uint256 => uint256) public arbitratorDisputeIDToLocalID;

    // ── Events ──────────────────────────────────────────────────────────────

    /// @dev IArbitrableV2
    event Ruling(IArbitratorV2 indexed _arbitrator, uint256 indexed _disputeID, uint256 _ruling);

    /// @dev IArbitrableV2
    event DisputeRequest(
        IArbitratorV2 indexed _arbitrator,
        uint256 indexed _arbitratorDisputeID,
        uint256 _externalDisputeID,
        uint256 _templateIdx,
        string _templateUri
    );

    /// @dev Evidence event for dispute evidence submissions
    event Evidence(uint256 indexed _arbitratorDisputeID, address indexed _party, string _evidence);

    // ── Errors ──────────────────────────────────────────────────────────────

    error OnlyArbitrator();
    error AlreadyRuled();
    error InvalidRuling();

    // ── Constructor ─────────────────────────────────────────────────────────

    constructor(address _arbitrator) {
        ARBITRATOR = IArbitratorV2(_arbitrator);
    }

    // ── IArbitrableV2.rule() ────────────────────────────────────────────────

    /// @notice Called by Kleros when jurors reach a decision.
    ///         Stores the ruling but does NOT execute protocol logic.
    function rule(uint256 _arbitratorDisputeID, uint256 _ruling) external {
        if (msg.sender != address(ARBITRATOR)) revert OnlyArbitrator();

        uint256 localID = arbitratorDisputeIDToLocalID[_arbitratorDisputeID];
        DisputeData storage d = disputes[localID];

        if (d.isRuled) revert AlreadyRuled();
        if (_ruling > d.numberOfRulingOptions) revert InvalidRuling();

        d.isRuled = true;
        d.ruling = _ruling;

        emit Ruling(ARBITRATOR, _arbitratorDisputeID, _ruling);
    }

    // ── Evidence ────────────────────────────────────────────────────────────

    /// @notice Submit evidence for a dispute. Permissionless.
    function submitEvidence(uint256 _arbitratorDisputeID, string calldata _evidence) external {
        emit Evidence(_arbitratorDisputeID, msg.sender, _evidence);
    }

    // ── View ────────────────────────────────────────────────────────────────

    function arbitrationCost(bytes calldata _extraData) external view returns (uint256) {
        return ARBITRATOR.arbitrationCost(_extraData);
    }

    function disputeCount() external view returns (uint256) {
        return disputes.length;
    }

    // ── Internal ────────────────────────────────────────────────────────────

    function _createKlerosDispute(bytes calldata _extraData, uint256 _numberOfRulingOptions)
        internal
        returns (uint256 arbitratorDisputeID, uint256 localDisputeID)
    {
        arbitratorDisputeID = ARBITRATOR.createDispute{value: msg.value}(_numberOfRulingOptions, _extraData);

        localDisputeID = disputes.length;
        disputes.push(DisputeData({isRuled: false, ruling: 0, numberOfRulingOptions: _numberOfRulingOptions}));
        arbitratorDisputeIDToLocalID[arbitratorDisputeID] = localDisputeID;

        emit DisputeRequest(ARBITRATOR, arbitratorDisputeID, localDisputeID, 0, "");
    }
}
