// Auto-generated from Foundry artifact — do not edit manually.
// Run: pnpm run generate:abi

export const arbitrableX402rAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_arbitrator",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ARBITRATOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IArbitratorV2"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "arbitrationCost",
    "inputs": [
      {
        "name": "_extraData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "arbitratorDisputeIDToLocalID",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createDispute",
    "inputs": [
      {
        "name": "_refundRequest",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_paymentInfo",
        "type": "tuple",
        "internalType": "struct PaymentInfo",
        "components": [
          {
            "name": "operator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "payer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "receiver",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "maxAmount",
            "type": "uint120",
            "internalType": "uint120"
          },
          {
            "name": "preApprovalExpiry",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "authorizationExpiry",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "refundExpiry",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "minFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeReceiver",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "salt",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "_nonce",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_refundAmount",
        "type": "uint120",
        "internalType": "uint120"
      },
      {
        "name": "_extraData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "arbitratorDisputeID",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "localDisputeID",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "disputeCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "disputes",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "isRuled",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "ruling",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "numberOfRulingOptions",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeRuling",
    "inputs": [
      {
        "name": "_localDisputeID",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_paymentInfo",
        "type": "tuple",
        "internalType": "struct PaymentInfo",
        "components": [
          {
            "name": "operator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "payer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "receiver",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "maxAmount",
            "type": "uint120",
            "internalType": "uint120"
          },
          {
            "name": "preApprovalExpiry",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "authorizationExpiry",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "refundExpiry",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "minFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeReceiver",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "salt",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getX402rDispute",
    "inputs": [
      {
        "name": "_localDisputeID",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ArbitrableX402r.X402rDisputeData",
        "components": [
          {
            "name": "refundRequest",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "refundAmount",
            "type": "uint120",
            "internalType": "uint120"
          },
          {
            "name": "executed",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refundToDispute",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rule",
    "inputs": [
      {
        "name": "_arbitratorDisputeID",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_ruling",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitEvidence",
    "inputs": [
      {
        "name": "_arbitratorDisputeID",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_evidence",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "x402rDisputes",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "refundRequest",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "refundAmount",
        "type": "uint120",
        "internalType": "uint120"
      },
      {
        "name": "executed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "DisputeCreated",
    "inputs": [
      {
        "name": "localDisputeID",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "arbitratorDisputeID",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "refundRequest",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "refundAmount",
        "type": "uint120",
        "indexed": false,
        "internalType": "uint120"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DisputeRequest",
    "inputs": [
      {
        "name": "_arbitrator",
        "type": "address",
        "indexed": true,
        "internalType": "contract IArbitratorV2"
      },
      {
        "name": "_arbitratorDisputeID",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_externalDisputeID",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_templateIdx",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "_templateUri",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Evidence",
    "inputs": [
      {
        "name": "_arbitratorDisputeID",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_party",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "_evidence",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Ruling",
    "inputs": [
      {
        "name": "_arbitrator",
        "type": "address",
        "indexed": true,
        "internalType": "contract IArbitratorV2"
      },
      {
        "name": "_disputeID",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_ruling",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RulingExecuted",
    "inputs": [
      {
        "name": "localDisputeID",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "ruling",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyExecuted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyRuled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicateDispute",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRuled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OnlyArbitrator",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OnlyPayer",
    "inputs": []
  }
] as const

export const arbitrableX402rBytecode = "0x60a060405234801561001057600080fd5b5060405161113438038061113483398101604081905261002f91610040565b6001600160a01b0316608052610070565b60006020828403121561005257600080fd5b81516001600160a01b038116811461006957600080fd5b9392505050565b6080516110866100ae600039600081816101f3015281816103e6015281816104a401528181610970015281816109f60152610b5401526110866000f3fe6080604052600436106100a75760003560e01c8063a6a7f0eb11610064578063a6a7f0eb14610242578063c55d665214610262578063cf2302b814610282578063e09997d914610366578063eb1eede914610393578063f7434ea9146103bb57600080fd5b80632f0a2877146100ac578063311a6c56146101475780634dae1ca114610169578063564a565d146101a457806368871c9c146101e1578063a28889e11461022d575b600080fd5b3480156100b857600080fd5b506101086100c7366004610bc8565b60026020819052600091825260409091208054600182015491909201546001600160a01b03909216916001600160781b03811690600160781b900460ff1684565b604080516001600160a01b03909516855260208501939093526001600160781b0390911691830191909152151560608201526080015b60405180910390f35b34801561015357600080fd5b50610167610162366004610be1565b6103db565b005b34801561017557600080fd5b50610196610184366004610bc8565b60036020526000908152604090205481565b60405190815260200161013e565b3480156101b057600080fd5b506101c46101bf366004610bc8565b6104f8565b60408051931515845260208401929092529082015260600161013e565b3480156101ed57600080fd5b506102157f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b03909116815260200161013e565b34801561023957600080fd5b50600054610196565b34801561024e57600080fd5b5061016761025d366004610c4c565b61052f565b34801561026e57600080fd5b5061016761027d366004610cb1565b610578565b34801561028e57600080fd5b5061031f61029d366004610bc8565b60408051608081018252600080825260208201819052918101829052606081019190915250600090815260026020818152604092839020835160808101855281546001600160a01b03168152600182015492810192909252909101546001600160781b03811692820192909252600160781b90910460ff161515606082015290565b60405161013e919081516001600160a01b03168152602080830151908201526040808301516001600160781b03169082015260609182015115159181019190915260800190565b34801561037257600080fd5b50610196610381366004610bc8565b60016020526000908152604090205481565b6103a66103a1366004610d12565b61074e565b6040805192835260208301919091520161013e565b3480156103c757600080fd5b506101966103d6366004610d96565b610956565b336001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000161461042457604051631777988560e11b815260040160405180910390fd5b600082815260016020526040812054815490919081908390811061044a5761044a610dd8565b60009182526020909120600390910201805490915060ff16156104805760405163304be85b60e11b815260040160405180910390fd5b805460ff191660019081178255810183905560405183815284906001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016907f394027a5fa6e098a1191094d1719d6929b9abc535fcc0c8f448d6a4e756222769060200160405180910390a350505050565b6000818154811061050857600080fd5b600091825260209091206003909102018054600182015460029092015460ff909116925083565b336001600160a01b0316837f39935cf45244bc296a03d6aef1cf17779033ee27090ce9c68d432367ce106996848460405161056b929190610e17565b60405180910390a3505050565b600080838154811061058c5761058c610dd8565b60009182526020909120600390910201805490915060ff166105c15760405163a0c5b3eb60e01b815260040160405180910390fd5b600083815260026020819052604090912090810154600160781b900460ff16156105fe57604051630dc1019760e01b815260040160405180910390fd5b60028101805460ff60781b1916600160781b1790556001828101549081900361069d578154600183015460028401546040516330b5adfd60e21b81526001600160a01b039093169263c2d6b7f4926106669289926001600160781b0390911690600401610f7e565b600060405180830381600087803b15801561068057600080fd5b505af1158015610694573d6000803e3d6000fd5b5050505061070d565b8060020361070d5781546001830154604051634f34ee4560e01b81526001600160a01b0390921691634f34ee45916106da91889190600401610fac565b600060405180830381600087803b1580156106f457600080fd5b505af1158015610708573d6000803e3d6000fd5b505050505b847f76b363d70472d47d20e4119f3625c05ed37ca51b1d9e1cd8b87d8c20530640f38260405161073f91815260200190565b60405180910390a25050505050565b6000806107616040880160208901610fc9565b6001600160a01b0316336001600160a01b031614610792576040516309f9fa4f60e21b815260040160405180910390fd5b600088886040516020016107a69190610fe4565b60408051601f1981840301815282825280516020918201206001600160a01b03909416908301528101919091526060810188905260800160408051601f198184030181529181528151602092830120600081815260039093529120549091501561082357604051631f2d141d60e21b815260040160405180910390fd5b61082f858560026109f1565b604080516080810182526001600160a01b03808e16825260208083018d81526001600160781b03808e168587019081526000606087018181528982526002958690529790209551865495166001600160a01b03199095169490941785559051600185810191909155925193909101805494511515600160781b026fffffffffffffffffffffffffffffffff19909516939091169290921792909217905591945092506108dc908390610ff3565b6003600083815260200190815260200160002081905550886001600160a01b031683837fa268454570deb332ff3592bd23a8e6080d6975848687e9c6678b1f36270f1a528a8a6040516109429291909182526001600160781b0316602082015260400190565b60405180910390a450965096945050505050565b60405163f7434ea960e01b81526000906001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000169063f7434ea9906109a79086908690600401610e17565b602060405180830381865afa1580156109c4573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906109e89190611014565b90505b92915050565b6000807f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031663c13517e1348588886040518563ffffffff1660e01b8152600401610a459392919061102d565b60206040518083038185885af1158015610a63573d6000803e3d6000fd5b50505050506040513d601f19601f82011682018060405250810190610a889190611014565b600080546040805160608101825283815260208082018581528284018a8152600180870188558780529351600387027f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e5638101805492151560ff199093169290921790915591517f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e564830155517f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e565909101558585525280832082905551929450925083916001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016917f8bd32f430ff060e6bd204709b3790c9807987263d3230c580dc80b5f89e2718691610bb891868252602082015260606040820181905260009082015260800190565b60405180910390a3935093915050565b600060208284031215610bda57600080fd5b5035919050565b60008060408385031215610bf457600080fd5b50508035926020909101359150565b60008083601f840112610c1557600080fd5b50813567ffffffffffffffff811115610c2d57600080fd5b602083019150836020828501011115610c4557600080fd5b9250929050565b600080600060408486031215610c6157600080fd5b83359250602084013567ffffffffffffffff811115610c7f57600080fd5b610c8b86828701610c03565b9497909650939450505050565b60006101808284031215610cab57600080fd5b50919050565b6000806101a08385031215610cc557600080fd5b82359150610cd68460208501610c98565b90509250929050565b80356001600160a01b0381168114610cf657600080fd5b919050565b80356001600160781b0381168114610cf657600080fd5b6000806000806000806102008789031215610d2c57600080fd5b610d3587610cdf565b9550610d448860208901610c98565b94506101a08701359350610d5b6101c08801610cfb565b92506101e087013567ffffffffffffffff811115610d7857600080fd5b610d8489828a01610c03565b979a9699509497509295939492505050565b60008060208385031215610da957600080fd5b823567ffffffffffffffff811115610dc057600080fd5b610dcc85828601610c03565b90969095509350505050565b634e487b7160e01b600052603260045260246000fd5b81835281816020850137506000828201602090810191909152601f909101601f19169091010190565b602081526000610e2b602083018486610dee565b949350505050565b803565ffffffffffff81168114610cf657600080fd5b803561ffff81168114610cf657600080fd5b610e7582610e6883610cdf565b6001600160a01b03169052565b610e8160208201610cdf565b6001600160a01b03166020830152610e9b60408201610cdf565b6001600160a01b03166040830152610eb560608201610cdf565b6001600160a01b03166060830152610ecf60808201610cfb565b6001600160781b03166080830152610ee960a08201610e33565b65ffffffffffff1660a0830152610f0260c08201610e33565b65ffffffffffff1660c0830152610f1b60e08201610e33565b65ffffffffffff1660e0830152610f356101008201610e49565b61ffff16610100830152610f4c6101208201610e49565b61ffff16610120830152610f636101408201610cdf565b6001600160a01b031661014083015261016090810135910152565b6101c08101610f8d8286610e5b565b836101808301526001600160781b0383166101a0830152949350505050565b6101a08101610fbb8285610e5b565b826101808301529392505050565b600060208284031215610fdb57600080fd5b6109e882610cdf565b61018081016109eb8284610e5b565b808201808211156109eb57634e487b7160e01b600052601160045260246000fd5b60006020828403121561102657600080fd5b5051919050565b838152604060208201526000611047604083018486610dee565b9594505050505056fea264697066735822122091f7c4a2fd765c20db2b91f0edbcd43b49b283865ca00590480015d14a86c88364736f6c634300081c0033" as `0x${string}`
