# arbiter-examples

Example arbiter implementations for [x402r](https://github.com/BackTrackCo/x402r-sdk) refund disputes.

## Examples

| Example | Description |
| --- | --- |
| [`x402r-ai-garbage-detector`](x402r-ai-garbage-detector) | AI garbage detection arbiter with pluggable inference providers (OpenAI, Ollama/TEE, ClawRouter) |
| [`x402r-kleros-example`](x402r-kleros-example) | Kleros arbitration for x402r refund disputes on Arbitrum Sepolia |
| [`x402r-schema-check`](x402r-schema-check) | Deterministic arbiter: judges responses against JSON rules published before payment, with a public receipt anyone holding the response can confirm |

## Related

- [x402r-sdk](https://github.com/BackTrackCo/x402r-sdk) — TypeScript SDK
- [x402r-contracts](https://github.com/BackTrackCo/x402r-contracts) — Solidity smart contracts
- [docs.x402r.org](https://docs.x402r.org) — Documentation

## License

[Apache-2.0](LICENSE)
