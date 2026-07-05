/**
 * pay-with-zend-sdk is a fully typed TypeScript SDK for "Pay with Zend".
 *
 * Authenticates against a per-user User API Key issued via `zend login`
 * (CLI device pairing).
 */
export { createZendClient, createZendPayment } from "./client.js";
export type { ZendClient } from "./client.js";
export { verifyWebhookSignature } from "./webhooks.js";
export { ZendPaymentError } from "./errors.js";
export type {
  ApiKeyMetadata,
  CreateApiKeyInput,
  CreateApiKeyResult,
  CreatePairingSessionInput,
  CreatePairingSessionResult,
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  DeveloperWebhookEvent,
  DeveloperWebhookEventType,
  GetPaymentRequestResult,
  ListPaymentRequestsParams,
  PairingSessionStatus,
  PairingSessionStatusResult,
  PaymentRequestStatus,
  RetrievePairingKeyResult,
  VerifyReturnTokenInput,
  VerifyReturnTokenResult,
  WebhookConfig,
  WebhookDeliveryRecord,
  ZendClientConfig,
} from "./types.js";
