/**
 * Webhook signature verification for Developer Webhook Events.
 *
 * Implements exactly the `t=<unix_seconds>,v1=<hex_hmac_sha256>` scheme used
 * by the backend's `webhooks::generate_webhook_signature` /
 * `verify_webhook_signature` (src/webhooks.rs) — the signed payload is
 * `"{timestamp}.{body}"`, HMAC-SHA256'd with the account's webhook secret
 * (which is a `whsec_<hex>`-prefixed string; the `whsec_` prefix is stripped
 * and the remainder hex-decoded to recover the raw key bytes, exactly as the
 * backend does). A signature accepted by one side is guaranteed to be
 * accepted by the other for the same payload/secret pair.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function deriveWebhookKey(secret: string): Buffer {
  if (secret.startsWith("whsec_")) {
    const hexPart = secret.slice("whsec_".length);
    try {
      return Buffer.from(hexPart, "hex");
    } catch {
      // fall through to raw-bytes below
    }
  }
  return Buffer.from(secret, "utf8");
}

function computeSignatureHex(payload: string, secret: string, timestampSeconds: number): string {
  const signedPayload = `${timestampSeconds}.${payload}`;
  const key = deriveWebhookKey(secret);
  return createHmac("sha256", key).update(signedPayload, "utf8").digest("hex");
}

/**
 * Verifies a `X-Zend-Signature` header value (format: `t=<unix>,v1=<hex>`)
 * against `payload` using `secret`.
 *
 * @param payload - The exact raw request body string received (not a
 *   re-serialized object — signature verification is over the literal bytes
 *   sent).
 * @param signatureHeader - The full header value, e.g. `"t=1700000000,v1=abcd..."`.
 * @param secret - The account's webhook secret (`whsec_...`), from `zend config get webhookUrl`
 *   or the dashboard.
 * @param toleranceSeconds - Maximum age of the signature timestamp. Defaults
 *   to 300 seconds, matching the backend's replay window exactly.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const parts = signatureHeader.split(",");
  if (parts.length !== 2) return false;

  const tPart = parts[0];
  const vPart = parts[1];
  if (tPart === undefined || vPart === undefined) return false;

  if (!tPart.startsWith("t=") || !vPart.startsWith("v1=")) return false;

  const timestampStr = tPart.slice("t=".length);
  const providedSigHex = vPart.slice("v1=".length);

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const age = nowSeconds - timestamp;
  if (age > toleranceSeconds) return false;
  if (age < -60) return false; // matches the backend's small future-timestamp tolerance

  const expectedSigHex = computeSignatureHex(payload, secret, timestamp);

  let expectedBuf: Buffer;
  let providedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedSigHex, "hex");
    providedBuf = Buffer.from(providedSigHex, "hex");
  } catch {
    return false;
  }

  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
