import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { AuthCaptureEvmScheme } from '@x402r/evm/auth-capture/facilitator';
import { x402rDefaults } from '@x402r/helpers';
import { encodePaymentRequiredHeader, encodePaymentResponseHeader, decodePaymentSignatureHeader } from '@x402/core/http';
import { clients, context, CHAIN_ID, HOLD_SECONDS, AMOUNT, chainConfig, saveState, maybeState } from '../lib/shared.mjs';

const c = await clients('merchant');
const ctx = await context();
assert.equal(c.account.address, ctx.merchant);
const port = Number(process.env.MERCHANT_PORT ?? 4021);
assert(Number.isSafeInteger(port) && port > 0 && port < 65536 && port !== 3000);
// Same SDK facilitator as BackTrack's separate facilitator process, embedded
// here so only the merchant needs ETH for authorizing the payer's signature.
const signer = toFacilitatorEvmSigner({ address: c.account.address,
  getCode: args => c.publicClient.getCode(args), readContract: args => c.publicClient.readContract(args),
  verifyTypedData: args => c.publicClient.verifyTypedData(args), writeContract: async args => {
    const hash = await c.walletClient.writeContract(args);
    await saveState('merchant-broadcast', { hash });
    return hash;
  },
  sendTransaction: args => c.walletClient.sendTransaction(args), waitForTransactionReceipt: args => c.publicClient.waitForTransactionReceipt(args) });
const scheme = new AuthCaptureEvmScheme(signer);
const offers = new Map();
const inFlight = new Map();
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/notice') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; assert(Buffer.byteLength(raw) <= 32_768, 'Notice too large.'); }
      const notice = JSON.parse(raw);
      assert.equal(notice.type, 'arbitration_service_notice');
      assert.equal(notice.respondentWallet?.toLowerCase(), ctx.merchant.toLowerCase());
      assert.match(notice.caseId, /^dis_[a-zA-Z0-9-]+$/);
      assert(typeof notice.inviteToken === 'string' && typeof notice.messageToSign === 'string');
      await saveState('notice', notice);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'); return;
    }
    if (req.method !== 'GET' || req.url !== '/resource') { res.writeHead(404).end(); return; }
    const header = req.headers['payment-signature'];
    if (!header) {
      const now = Math.floor(Date.now() / 1000);
      const requirements = { scheme: 'auth-capture', network: `eip155:${CHAIN_ID}`, amount: AMOUNT.toString(),
        asset: chainConfig.usdc, payTo: c.account.address, maxTimeoutSeconds: 3600,
        extra: { ...x402rDefaults({ captureAuthorizer: ctx.operatorAddress, feeRecipient: ctx.operatorAddress,
          captureDeadline: now + HOLD_SECONDS + 86400, refundDeadline: now + HOLD_SECONDS + 86400,
          minFeeBps: 0, maxFeeBps: 100, name: 'USDC', version: '2', autoCapture: false, assetTransferMethod: 'eip3009' }),
          arbitrationTerms: ctx.arbitrationTerms } };
      const offerId = createHash('sha256').update(JSON.stringify(requirements)).digest('hex');
      offers.set(offerId, { requirements, expires: now + 3600 });
      for (const [id, offer] of offers) if (offer.expires < now) offers.delete(id);
      if (offers.size > 1000) offers.delete(offers.keys().next().value);
      const challenge = { x402Version: 2, resource: { url: `http://localhost:${port}/resource`, description: 'Testnet resource: weather with numeric temperature', mimeType: 'application/json' }, accepts: [requirements] };
      res.writeHead(402, { 'content-type': 'application/json', 'payment-required': encodePaymentRequiredHeader(challenge) });
      res.end(JSON.stringify(challenge)); return;
    }
    assert(typeof header === 'string' && header.length < 32_768, 'Invalid payment header.');
    const payload = decodePaymentSignatureHeader(header);
    const offerId = createHash('sha256').update(JSON.stringify(payload.accepted)).digest('hex');
    const offer = offers.get(offerId);
    assert(offer && offer.expires >= Math.floor(Date.now() / 1000), 'Offer expired or not issued here. Request a new 402.');
    assert.equal(payload.payload.salt, `0x${ctx.arbitrationTerms.termsHash}`, 'Payment must bind registered terms before signing.');
    const nonce = payload.payload.authorization.nonce;
    const cacheName = `settlement-${nonce}`;
    assert.match(nonce, /^0x[0-9a-f]{64}$/);
    // Coalesce same-payment requests and retain results across server restarts.
    // A pending marker blocks automatic rebroadcast after an ambiguous outcome.
    const settle = async () => {
      const previous = await maybeState(cacheName);
      if (previous?.result?.success) return previous;
      assert(!previous, 'Prior settlement outcome is unknown. Reconcile .state and chain receipts before retrying.');
      const verified = await scheme.verify(payload, offer.requirements);
      assert(verified.isValid, `Verification refused: ${verified.invalidReason}`);
      await saveState(cacheName, { pending: true });
      const result = await scheme.settle(payload, offer.requirements);
      const deliverable = { location: 'Testnet fixture', temperature: null, error: 'upstream unavailable' };
      await saveState(cacheName, { result, deliverable });
      assert(result.success, `Authorization failed: ${result.errorReason}`);
      return { result, deliverable };
    };
    if (!inFlight.has(nonce)) inFlight.set(nonce, settle().finally(() => inFlight.delete(nonce)));
    const { result, deliverable } = await inFlight.get(nonce);
    res.writeHead(200, { 'content-type': 'application/json', 'payment-response': encodePaymentResponseHeader(result) });
    res.end(JSON.stringify(deliverable));
  } catch (e) {
    console.error(e.message);
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`merchant pid=${process.pid} http://localhost:${port}/resource`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
