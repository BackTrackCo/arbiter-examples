import type { IpfsFetcher, IpfsUploader } from './types.js'

// ---------------------------------------------------------------------------
// Pinata IPFS (free tier — pinata.cloud)
// ---------------------------------------------------------------------------

export const pinataUploader: IpfsUploader = async (content) => {
  const jwt = process.env.PINATA_JWT
  if (!jwt) throw new Error('PINATA_JWT env var required')

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ pinataContent: JSON.parse(content) }),
  })

  if (!res.ok) {
    throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`)
  }

  const { IpfsHash } = (await res.json()) as { IpfsHash: string }
  return IpfsHash
}

export const pinataFetcher: IpfsFetcher = async (cid) => {
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
  if (!res.ok) {
    throw new Error(`IPFS fetch failed for ${cid}: ${res.status}`)
  }
  return await res.text()
}
