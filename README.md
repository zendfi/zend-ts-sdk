# pay-with-zend-sdk

A fully typed TypeScript SDK for **Pay with Zend** — create payment requests against your own Zend account, verify webhook signatures, and confirm post-payment return tokens, all from your own backend or scripts.

This SDK is not a merchant integration. There is no separate "merchant" account type here — a **Developer** is just a regular Zend user who has paired a CLI (or otherwise obtained a User API Key) to their own account. Every request this SDK makes settles directly to that user's own wallet.

> Looking for the CLI instead? See [`pay-with-zend-cli`](../zend-cli/README.md) — it uses this SDK internally and is usually the fastest way to get an API key in the first place.

## Installation

```bash
npm install pay-with-zend-sdk
# or
pnpm add pay-with-zend-sdk
# or
yarn add pay-with-zend-sdk
```

Requires Node.js 18 or later (uses the global `fetch` and `node:crypto`).

## Getting an API key

You cannot create a User API Key by typing a secret anywhere — it's issued through a device-pairing flow, the same pattern used by tools like the GitHub CLI. The easiest way to get one is:

```bash
npx pay-with-zend-cli login
```

This prints an approval link (and a QR code) — open it on your phone, approve it inside the Zend App with your existing PIN/biometrics, and the CLI receives your key automatically. The key is never typed into a terminal.

If you'd rather drive the pairing flow yourself (e.g. from your own onboarding UI), see [Programmatic pairing](#programmatic-pairing) below.

## Quick start

```typescript
import { createZendClient } from "pay-with-zend-sdk";

const zend = createZendClient({
  apiKey: process.env.ZEND_API_KEY!, // zdev_live_...
});

const payment = await zend.createZendPayment({
  amountUsdc: 25.0,
  description: "Order #1024",
  redirectUrl: "https://yourapp.com/checkout/return",
  webhookUrl: "https://yourapp.com/webhooks/zend", // optional per-request override
});

console.log(payment.linkUrl);
// https://zdfi.me/yourtag/abc123def0
```

Share `payment.linkUrl` with your customer. On a phone with the Zend App installed, it deep-links straight into a native payment confirmation sheet. Without the app, it falls back to the hosted `zdfi.me` web checkout. Same link, both paths — you don't need to detect which one applies.

There's also a plain convenience function if you don't want to hold onto a client instance:

```typescript
import { createZendPayment } from "pay-with-zend-sdk";

const payment = await createZendPayment(
  { apiKey: process.env.ZEND_API_KEY! },
  { amountUsdc: 25.0 },
);
```

## API reference

### `createZendClient(config)`

```typescript
interface ZendClientConfig {
  apiKey: string;
  baseUrl?: string; // defaults to https://zdfi.me
}
```

Returns a `ZendClient` with the methods below. Every method throws `ZendPaymentError` on failure (see [Error handling](#error-handling)).

### Payment requests

#### `createZendPayment(input)`

```typescript
interface CreatePaymentRequestInput {
  amountUsdc: number;          // 0.01 - 100,000
  description?: string;         // max 500 characters
  expiresInMinutes?: number;    // 1 - 60, defaults to 15
  redirectUrl?: string;         // HTTPS, max 2048 characters
  webhookUrl?: string;          // HTTPS, max 2048 characters — overrides your global webhook URL for this request only
}
```

Returns a `CreatePaymentRequestResult`:

```typescript
interface CreatePaymentRequestResult {
  id: string;
  linkUrl: string;             // the zdfi.me link — share this with your customer
  status: "pending";
  amountUsdc: number;
  description: string | null;
  expiresAt: string;           // ISO 8601
  source: "api";
}
```

`redirectUrl` only matters for mobile web checkout flows: after the payer confirms inside the Zend App, they're redirected back to this URL with a single-use `zend_return_token` query parameter attached. Verify that token server-side with [`verifyReturnToken`](#verifyreturntokeninput) before trusting the redirect (see [Return tokens](#return-tokens)).

#### `getPaymentRequest(id)`

```typescript
const request = await zend.getPaymentRequest(payment.id);
// { id, status, amountUsdc, description, expiresAt, paidAt, hasRedirectUrl, linkUrl }
```

`status` is one of `"pending" | "paid" | "expired" | "cancelled"`. Requesting a payment request that doesn't exist, or belongs to a different account, returns an identical "not found" error in both cases — the SDK (and the API underneath it) never reveals which.

#### `listPaymentRequests(params?)`

```typescript
const { requests } = await zend.listPaymentRequests({ status: "paid", limit: 20 });
```

`limit` is clamped to 1-50 (defaults to 20).

#### `testPaymentRequest(input)` — Sandbox Mode

Takes the exact same input as `createZendPayment`, runs the exact same validation server-side, but never creates a request, moves funds, or fires a webhook:

```typescript
const result = await zend.testPaymentRequest({ amountUsdc: 25.0 });
// { sandbox: true, valid: true, amountUsdc: 25, description: null, expiresInMinutes: 15, redirectUrl: null, webhookUrl: null }
```

Useful in CI or local dev to confirm your integration is sending well-formed requests without touching a real balance.

### Webhooks

Configure where events are delivered, and validate them when they arrive.

#### `getWebhookConfig()` / `setWebhookUrl(url)`

```typescript
await zend.setWebhookUrl("https://yourapp.com/webhooks/zend");
const config = await zend.getWebhookConfig();
// { webhookUrl: "https://yourapp.com/webhooks/zend", hasSecret: true }
```

A webhook secret is generated automatically the first time you set a URL — you never generate or upload one yourself. Get the secret's value from `zend config get webhookUrl` in the CLI, or from your account settings; it's never returned by this call for security (only whether one exists).

#### `verifyWebhookSignature(payload, signatureHeader, secret, toleranceSeconds?)`

Every Developer Webhook Event is delivered with an `X-Zend-Signature` header in the form `t=<unix_seconds>,v1=<hex_hmac_sha256>`. Verify it like this:

```typescript
import { verifyWebhookSignature } from "pay-with-zend-sdk";
import express from "express";

const app = express();

app.post("/webhooks/zend", express.text({ type: "*/*" }), (req, res) => {
  const signatureHeader = req.header("X-Zend-Signature") ?? "";
  const isValid = verifyWebhookSignature(req.body, signatureHeader, process.env.ZEND_WEBHOOK_SECRET!);

  if (!isValid) {
    return res.status(401).send("invalid signature");
  }

  const event = JSON.parse(req.body) as import("pay-with-zend-sdk").DeveloperWebhookEvent;
  // handle event.event, event.payment_request, ...
  res.status(200).send("ok");
});
```

**Important:** verify against the raw request body string, not a re-serialized object — the signature is computed over the exact bytes sent, and re-serializing (even to logically identical JSON) can produce a different byte sequence and fail verification.

`toleranceSeconds` defaults to 300 (5 minutes), matching the backend's replay window exactly. Signatures older than that are rejected regardless of correctness.

#### Event types

```typescript
type DeveloperWebhookEventType =
  | "payment_request_created"
  | "payment_request_pending"
  | "payment_request_succeeded"
  | "payment_request_failed"
  | "payment_request_expired"
  | "payment_request_cancelled";
```

Events are only ever fired for requests you created via this SDK/the CLI (`source: "api"`) — peer-to-peer payments made from inside the Zend App never trigger a Developer Webhook Event.

#### `listWebhookDeliveries(limit?)`

```typescript
const deliveries = await zend.listWebhookDeliveries(50);
// [{ eventType, webhookUrl, status, attempts, responseCode, createdAt }, ...]
```

Useful for debugging delivery failures without needing to check `zend logs tail` in the CLI.

### Return tokens

If you set `redirectUrl` on a payment request and the payer confirms via the native app, they're redirected back to that URL with `?zend_return_token=...` appended. Verify it before resuming their session:

```typescript
const result = await zend.verifyReturnToken({
  token: req.query.zend_return_token as string,
  paymentRequestId: payment.id,
});

if (result.valid) {
  // resume the customer's checkout session
}
```

Return tokens are single-use and expire 5 minutes after issuance. Every failure mode — expired, already used, unknown, or bound to a different request — is reported identically as `valid: false`; the API deliberately does not distinguish between them, so don't try to branch on *why* a token failed.

### API key management

```typescript
const created = await zend.createApiKey({ scopes: ["create_payment_request", "read"] });
console.log(created.apiKey); // shown exactly once — store it now, it cannot be retrieved again

const keys = await zend.listApiKeys();
// [{ id, displayPrefix, scopes, createdAt, lastUsedAt }, ...] — never includes plaintext keys

await zend.revokeApiKey(created.id);
```

Scopes are `"create_payment_request" | "read" | "manage_webhook"`. A key can only ever create another key with a subset of its own scopes — you can't use a `read`-only key to mint yourself broader access.

## Error handling

Every SDK method throws `ZendPaymentError` on failure:

```typescript
import { ZendPaymentError } from "pay-with-zend-sdk";

try {
  await zend.createZendPayment({ amountUsdc: -5 });
} catch (err) {
  if (err instanceof ZendPaymentError) {
    console.error(err.code);       // e.g. "INVALID_AMOUNT"
    console.error(err.message);    // human-readable
    console.error(err.statusCode); // HTTP status, if the error came from a response
  }
}
```

Network failures (timeouts, DNS errors, connection refused) also throw `ZendPaymentError`, with `code: "NETWORK_ERROR"` and no `statusCode`.

## Programmatic pairing

Most integrations should just run `zend login` from the CLI. If you're building your own onboarding flow and want to drive the device-pairing handshake directly, the client also exposes the underlying pairing primitives:

```typescript
const anon = createZendClient({ apiKey: "" }); // no key needed yet

const session = await anon.createPairingSession({ cliDisplayName: "My Integration" });
console.log(session.approvalUrl); // show this as a link or QR code to the user

// Poll no faster than every 2 seconds
let status = "pending";
while (status === "pending") {
  await new Promise((r) => setTimeout(r, 2000));
  ({ status } = await anon.getPairingSessionStatus(session.sessionId));
}

if (status === "approved") {
  const { apiKey } = await anon.retrievePairingKey(session.sessionId); // succeeds exactly once
  // persist apiKey securely
}
```

`retrievePairingKey` can only be called once per session — a second call returns an error, by design.

## Types

Every request, response, and webhook payload used by this SDK is exported as a named type — the package has no `any` in its public surface. Import what you need directly:

```typescript
import type {
  ZendClientConfig,
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  GetPaymentRequestResult,
  DeveloperWebhookEvent,
  DeveloperWebhookEventType,
  VerifyReturnTokenInput,
  VerifyReturnTokenResult,
  WebhookConfig,
  WebhookDeliveryRecord,
  ApiKeyMetadata,
  CreateApiKeyInput,
  CreateApiKeyResult,
  TestPaymentRequestResult,
} from "pay-with-zend-sdk";
```

## Security notes

- Treat your API key like any other secret — it's scoped to your own account and can create payment requests, read your data, and (depending on scopes) manage your webhook config.
- Always verify webhook signatures before acting on a webhook payload. Never trust an unsigned or incorrectly-signed request.
- `redirect_url` and `webhook_url` must be HTTPS — plain HTTP is rejected by the API.
- This SDK never touches merchant infrastructure, merchant API keys, or merchant endpoints. It is a distinct, user-scoped system by design.

## License

MIT
