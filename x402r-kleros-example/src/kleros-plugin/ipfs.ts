import PinataClient from '@pinata/sdk'
import type { IpfsFetcher, IpfsUploader } from './types.js'

// ---------------------------------------------------------------------------
// Pinata IPFS (free tier — pinata.cloud)
// ---------------------------------------------------------------------------

export function createPinataUploader(jwt: string): IpfsUploader {
  const pinata = new PinataClient({ pinataJWTKey: jwt })
  return async (content) => {
    const { IpfsHash } = await pinata.pinJSONToIPFS(content)
    return IpfsHash
  }
}

export const pinataFetcher: IpfsFetcher = async (cid) => {
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
  if (!res.ok) {
    throw new Error(`IPFS fetch failed for ${cid}: ${res.status}`)
  }
  return await res.text()
}
