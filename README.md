# arbiter-examples

Example arbiter implementations for [x402r](https://github.com/BackTrackCo/x402r-sdk) refund disputes.

## Examples

| Example | Description |
| --- | --- |
| [`x402r-kleros-example`](x402r-kleros-example) | Kleros arbitration for x402r refund disputes on Arbitrum Sepolia |

## What is an arbiter?

In x402r, funds are held in escrow after payment. A payer can request a refund; an **arbiter** — a contract authorized to call `operator.refundInEscrow()` or `RefundRequest.deny()` — decides the outcome. Each example in this repo demonstrates a different arbitration mechanism.

## Related

- [x402r-sdk](https://github.com/BackTrackCo/x402r-sdk) — TypeScript SDK
- [x402r-contracts](https://github.com/BackTrackCo/x402r-contracts) — Solidity smart contracts
- [docs.x402r.org](https://docs.x402r.org) — Documentation

## License

[Apache-2.0](LICENSE)
