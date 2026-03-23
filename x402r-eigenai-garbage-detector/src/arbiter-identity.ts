import { keccak256, toBytes, type Address, type Hex } from "viem";
import type { LocalAccount } from "viem/accounts";
import type { ResourceServerExtension, SettleResultContext } from "@x402/core/types";
import type { HTTPTransportContext } from "@x402/core/http";

// ---------------------------------------------------------------------------
// EIP-712 types
// ---------------------------------------------------------------------------

const IDENTITY_DOMAIN = {
  name: "x402r arbiter identity",
  version: "1",
} as const;

const IDENTITY_TYPES = {
  ArbiterIdentity: [
    { name: "role", type: "string" },
    { name: "operator", type: "address" },
    { name: "info", type: "string" },
  ],
} as const;

const ACKNOWLEDGMENT_DOMAIN = {
  name: "x402r arbiter acknowledgment",
  version: "1",
} as const;

const ACKNOWLEDGMENT_TYPES = {
  ArbiterAcknowledgment: [
    { name: "operator", type: "address" },
    { name: "transaction", type: "string" },
    { name: "network", type: "string" },
    { name: "contentHash", type: "bytes32" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

// ---------------------------------------------------------------------------
// Sign identity (arbiter signs this, served via GET /identity)
// ---------------------------------------------------------------------------

export interface SignedArbiterIdentity {
  role: string;
  operator: Address;
  info: string;
  signature: Hex;
  arbiter: Address;
}

export async function signArbiterIdentity(
  account: LocalAccount,
  operator: Address,
  info: string,
): Promise<SignedArbiterIdentity> {
  const message = { role: "escrow-arbiter", operator, info };

  const signature = await account.signTypedData({
    domain: IDENTITY_DOMAIN,
    types: IDENTITY_TYPES,
    primaryType: "ArbiterIdentity",
    message,
  });

  return {
    role: "escrow-arbiter",
    operator,
    info,
    signature,
    arbiter: account.address,
  };
}

// ---------------------------------------------------------------------------
// Sign acknowledgment (arbiter signs per-transaction)
// ---------------------------------------------------------------------------

export interface SignedAcknowledgment {
  operator: Address;
  transaction: string;
  network: string;
  contentHash: Hex;
  timestamp: number;
  signature: Hex;
  arbiter: Address;
}

export async function signAcknowledgment(
  account: LocalAccount,
  params: {
    operator: Address;
    transaction: string;
    network: string;
    contentHash: Hex;
  },
): Promise<SignedAcknowledgment> {
  const timestamp = Math.floor(Date.now() / 1000);

  const message = {
    operator: params.operator,
    transaction: params.transaction,
    network: params.network,
    contentHash: params.contentHash,
    timestamp: BigInt(timestamp),
  };

  const signature = await account.signTypedData({
    domain: ACKNOWLEDGMENT_DOMAIN,
    types: ACKNOWLEDGMENT_TYPES,
    primaryType: "ArbiterAcknowledgment",
    message,
  });

  return {
    ...params,
    timestamp,
    signature,
    arbiter: account.address,
  };
}

// ---------------------------------------------------------------------------
// Merchant extension — fetches identity from arbiter API
// ---------------------------------------------------------------------------

export function createArbiterIdentityExtension(
  arbiterUrl: string,
  operatorAddress: Address,
): ResourceServerExtension {
  return {
    key: "arbiter-identity",

    // Pre-payment: include signed arbiter identity in 402
    enrichPaymentRequiredResponse: async () => {
      try {
        const res = await fetch(
          `${arbiterUrl}/identity?operator=${operatorAddress}`,
        );
        if (!res.ok) return undefined;
        const identity = await res.json();
        return { info: { identity } };
      } catch {
        return undefined;
      }
    },

    // Post-payment: include signed acknowledgment in 200
    enrichSettlementResponse: async (
      _declaration: unknown,
      context: SettleResultContext,
    ) => {
      if (!context.result.success) return undefined;

      const transportCtx = context.transportContext as HTTPTransportContext | undefined;
      const responseBody = transportCtx?.responseBody;
      if (!responseBody) return undefined;

      const contentHash = keccak256(toBytes(responseBody.toString("utf-8")));

      try {
        const res = await fetch(`${arbiterUrl}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operator: operatorAddress,
            transaction: context.result.transaction,
            network: context.result.network,
            contentHash,
            responseBody: responseBody.toString("utf-8"),
          }),
        });
        if (!res.ok) return undefined;
        const acknowledgment = await res.json();
        return { info: { acknowledgment } };
      } catch {
        return undefined;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Route declaration — scope extension to specific routes
// ---------------------------------------------------------------------------

const ARBITER_IDENTITY_KEY = "arbiter-identity";

export function declareArbiterIdentityExtension(): Record<string, Record<string, never>> {
  return {
    [ARBITER_IDENTITY_KEY]: {},
  };
}

export { IDENTITY_DOMAIN, IDENTITY_TYPES, ACKNOWLEDGMENT_DOMAIN, ACKNOWLEDGMENT_TYPES };
