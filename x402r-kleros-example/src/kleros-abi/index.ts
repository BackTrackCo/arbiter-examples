// ---------------------------------------------------------------------------
// KlerosCoreRuler — 0x1Bd44c4a4511DbFa7DC1d5BC201635596E7200f9
// ---------------------------------------------------------------------------

export const klerosCoreRulerAbi = [
  {
    type: 'function',
    name: 'arbitrationCost',
    inputs: [{ name: '_extraData', type: 'bytes', internalType: 'bytes' }],
    outputs: [{ name: 'cost', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'currentRuling',
    inputs: [{ name: '_disputeID', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'ruling', type: 'uint256', internalType: 'uint256' },
      { name: 'tied', type: 'bool', internalType: 'bool' },
      { name: 'overridden', type: 'bool', internalType: 'bool' },
    ],
    stateMutability: 'view',
  },
] as const

// ---------------------------------------------------------------------------
// DisputeResolver — 0xed31bEE8b1F7cE89E93033C0d3B2ccF4cEb27652
// ---------------------------------------------------------------------------

export const disputeResolverAbi = [
  {
    type: 'function',
    name: 'createDisputeForTemplate',
    inputs: [
      { name: '_extraData', type: 'bytes', internalType: 'bytes' },
      { name: '_disputeTemplate', type: 'string', internalType: 'string' },
      { name: '_disputeTemplateDataMappings', type: 'string', internalType: 'string' },
      { name: '_numberOfRulingOptions', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: 'disputeID', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'DisputeRequest',
    inputs: [
      { name: '_arbitrator', type: 'address', indexed: true, internalType: 'contract IArbitratorV2' },
      { name: '_arbitrableDisputeID', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: '_externalDisputeID', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: '_templateId', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: '_templateUri', type: 'string', indexed: false, internalType: 'string' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Ruling',
    inputs: [
      { name: '_arbitrator', type: 'address', indexed: true, internalType: 'contract IArbitratorV2' },
      { name: '_disputeID', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: '_ruling', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
] as const

// ---------------------------------------------------------------------------
// EvidenceModule — 0xA88A9a25cE7f1d8b3941dA3b322Ba91D009E1397
// ---------------------------------------------------------------------------

export const evidenceModuleAbi = [
  {
    type: 'function',
    name: 'submitEvidence',
    inputs: [
      { name: '_externalDisputeID', type: 'uint256', internalType: 'uint256' },
      { name: '_evidence', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Evidence',
    inputs: [
      { name: '_externalDisputeID', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: '_party', type: 'address', indexed: true, internalType: 'address' },
      { name: '_evidence', type: 'string', indexed: false, internalType: 'string' },
    ],
    anonymous: false,
  },
] as const
