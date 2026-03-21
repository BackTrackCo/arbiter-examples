/**
 * @kleros/kleros-v2-contracts ships CJS in its ESM entry point, so named
 * imports break under "type": "module".  This file loads it via createRequire
 * and re-exports the pieces we need.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { testnetViem } = require('@kleros/kleros-v2-contracts') as {
  testnetViem: typeof import('@kleros/kleros-v2-contracts').testnetViem
}

export const klerosCoreAbi = testnetViem.klerosCoreAbi
