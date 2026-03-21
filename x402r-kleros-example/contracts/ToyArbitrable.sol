// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IArbitrator {
    function createDispute(uint256 _choices, bytes calldata _extraData)
        external
        payable
        returns (uint256 disputeID);
}

/// @notice Minimal arbitrable contract that forwards createDispute to a Kleros
///         arbitrator and accepts rule() callbacks as a no-op. Used by the
///         x402r Kleros plugin so that KlerosCoreRuler.executeRuling() has a
///         contract (not EOA) to call rule() on.
contract ToyArbitrable {
    function createDispute(address arbitrator, uint256 choices, bytes calldata extraData)
        external
        payable
        returns (uint256)
    {
        return IArbitrator(arbitrator).createDispute{value: msg.value}(choices, extraData);
    }

    function rule(uint256, uint256) external {}
}
