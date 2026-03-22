/**
 * Generates src/kleros-plugin/generated.ts from the Foundry build artifact.
 * Run: pnpm run generate:abi (after pnpm run build:contracts)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const artifactPath = resolve(__dirname, '../../contracts/out/ArbitrableX402r.sol/ArbitrableX402r.json')
const outputPath = resolve(__dirname, '../kleros-plugin/generated.ts')

const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))

const output = `// Auto-generated from Foundry artifact — do not edit manually.
// Run: pnpm run generate:abi

export const arbitrableX402rAbi = ${JSON.stringify(artifact.abi, null, 2)} as const

export const arbitrableX402rBytecode = ${JSON.stringify(artifact.bytecode.object)} as \`0x\${string}\`
`

writeFileSync(outputPath, output)
console.log(`Generated ${outputPath}`)
