/**
 * All request, response, and webhook payload types for Pay with Zend.
 *
 * Every exported function in this package uses these named types — no `any`
 * appears in any public signature (Requirement 7.1).
 */

/** Configuration for {@link createZendClient}. */
export interface ZendClientConfig {
  /** A User API Key issued via CLI Pairing (`zdev_...`). Never a merchant API key. */
  apiKey: string;
  /** Defaults to `https://zdfi.me`. Override for local/staging testing. */
  baseUrl?: string;
}

/** Input to {@link ZendClient.createZendPayment}. */
export interface CreatePaymentRequestInput {
  amountUsdc: number;
  description?: string;
  /** 1-60 minutes; defaults to 15 minutes when omitted. */
  expiresInMinutes?: number;
  /** HTTPS URL, <=2048 characters. Enables the post-confirmation return redirect. */
  redirectUrl?: string;
  /** HTTPS URL, <=2048 characters. Overrides the account's global webhook URL for this request only. */
  webhookUrl?: string;
}

export type PaymentRequestStatus = "pending" | "paid" | "expired" | "cancelled";

/** Result of {@link ZendClient.createZendPayment}. */
export interface CreatePaymentRequestResult {
  id: string;
  /** The `zdfi.me` link — usable for both app deep-linking and hosted web fallback. */
  linkUrl: string;
  status: "pending";
  amountUsdc: number;
  description: string | null;
  expiresAt: string;
  source: "api";
}

/** Result of {@link ZendClient.getPaymentRequest} / {@link ZendClient.listPaymentRequests}. */
export interface GetPaymentRequestResult {
  id: string;
  status: PaymentRequestStatus;
  amountUsdc: number | null;
  description: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  hasRedirectUrl: boolean;
  linkUrl: string;
}

export interface ListPaymentRequestsParams {
  status?: PaymentRequestStatus;
  /** 1-50; defaults to 20. */
  limit?: number;
}

export type DeveloperWebhookEventType =
  | "payment_request_created"
  | "payment_request_pending"
  | "payment_request_succeeded"
  | "payment_request_failed"
  | "payment_request_expired"
  | "payment_request_cancelled";

/** Shape of a Developer Webhook Event payload delivered to a configured webhook URL. */
export interface DeveloperWebhookEvent {
  event: DeveloperWebhookEventType;
  timestamp: string;
  payment_request: {
    id: string;
    amount_usdc: number | null;
    description: string | null;
    status: string;
  };
}

export interface VerifyReturnTokenInput {
  token: string;
  paymentRequestId: string;
}

export interface VerifyReturnTokenResult {
  valid: boolean;
}

export interface WebhookConfig {
  webhookUrl: string | null;
  hasSecret: boolean;
}

/** Result of {@link ZendClient.testPaymentRequest} — Sandbox Mode dry-run. */
export interface TestPaymentRequestResult {
  sandbox: true;
  valid: boolean;
  amountUsdc: number;
  description: string | null;
  expiresInMinutes: number;
  redirectUrl: string | null;
  webhookUrl: string | null;
}

export interface CreateApiKeyInput {
  scopes: Array<"create_payment_request" | "read" | "manage_webhook">;
}

export interface CreateApiKeyResult {
  id: string;
  /** The plaintext key — returned exactly once, at creation time. */
  apiKey: string;
  scopes: string[];
  createdAt: string;
}

export interface ApiKeyMetadata {
  id: string;
  displayPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface WebhookDeliveryRecord {
  eventType: string;
  webhookUrl: string;
  status: string;
  attempts: number;
  responseCode: number | null;
  createdAt: string;
}

// ── CLI pairing (used internally by zend-cli via this SDK) ─────────────────

export interface CreatePairingSessionInput {
  cliDisplayName: string;
}

export interface CreatePairingSessionResult {
  sessionId: string;
  pairingCode: string;
  approvalUrl: string;
  expiresAt: string;
}

export type PairingSessionStatus = "pending" | "approved" | "denied" | "expired";

export interface PairingSessionStatusResult {
  sessionId: string;
  status: PairingSessionStatus;
  cliDisplayName: string;
  expiresAt: string;
}

export interface RetrievePairingKeyResult {
  apiKey: string;
}
