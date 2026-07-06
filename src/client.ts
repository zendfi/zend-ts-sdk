import { ZendPaymentError } from "./errors.js";
import type {
  ApiKeyMetadata,
  CreateApiKeyInput,
  CreateApiKeyResult,
  CreatePairingSessionInput,
  CreatePairingSessionResult,
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  GetPaymentRequestResult,
  ListPaymentRequestsParams,
  PairingSessionStatusResult,
  RetrievePairingKeyResult,
  TestPaymentRequestResult,
  VerifyReturnTokenInput,
  VerifyReturnTokenResult,
  WebhookConfig,
  WebhookDeliveryRecord,
  ZendClientConfig,
} from "./types.js";

const DEFAULT_BASE_URL = "https://zdfi.me";

interface BackendErrorBody {
  error?: string;
  message?: string;
}

async function parseErrorResponse(response: Response): Promise<ZendPaymentError> {
  let body: BackendErrorBody = {};
  try {
    body = (await response.json()) as BackendErrorBody;
  } catch {
    // non-JSON error body, fall through with generic message
  }
  return new ZendPaymentError(
    body.error ?? "UNKNOWN_ERROR",
    body.message ?? `Request failed with status ${response.status}`,
    response.status,
  );
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit & { authHeader?: string },
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.authHeader) {
    headers.Authorization = init.authHeader;
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err) {
    throw new ZendPaymentError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Network request failed",
    );
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new ZendPaymentError(
      "INVALID_RESPONSE",
      "Failed to parse JSON response from server",
    );
  }
}

/**
 * A typed, User-API-Key-authenticated client for Pay with Zend.
 *
 * Authenticates exclusively against `AuthenticatedApiUser`-protected
 * endpoints under `/api/v1/dev/*` and the public `/api/v1/dev/cli-auth/*`
 * pairing endpoints. Never references merchant API key formats or
 * merchant-scoped endpoints (Requirement 7.5).
 */
export interface ZendClient {
  createZendPayment(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult>;
  /** Sandbox Mode dry-run — validates `input` exactly as `createZendPayment` would, but never
   * creates a payment request, moves funds, or delivers a live Developer Webhook Event. */
  testPaymentRequest(input: CreatePaymentRequestInput): Promise<TestPaymentRequestResult>;
  getPaymentRequest(id: string): Promise<GetPaymentRequestResult>;
  listPaymentRequests(params?: ListPaymentRequestsParams): Promise<GetPaymentRequestResult[]>;
  verifyReturnToken(input: VerifyReturnTokenInput): Promise<VerifyReturnTokenResult>;

  createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult>;
  listApiKeys(): Promise<ApiKeyMetadata[]>;
  revokeApiKey(id: string): Promise<void>;

  getWebhookConfig(): Promise<WebhookConfig>;
  setWebhookUrl(webhookUrl: string): Promise<WebhookConfig>;
  listWebhookDeliveries(limit?: number): Promise<WebhookDeliveryRecord[]>;

  // CLI pairing — used internally by zend-cli, exposed here since it's part
  // of the same typed HTTP surface and requires no API key (the whole point
  // of the pairing flow is to obtain one).
  createPairingSession(input: CreatePairingSessionInput): Promise<CreatePairingSessionResult>;
  getPairingSessionStatus(sessionId: string): Promise<PairingSessionStatusResult>;
  retrievePairingKey(sessionId: string): Promise<RetrievePairingKeyResult>;
}

class ZendClientImpl implements ZendClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ZendClientConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private authHeader(): string {
    return `Bearer ${this.apiKey}`;
  }

  async createZendPayment(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult> {
    const body = {
      amount_usdc: input.amountUsdc,
      description: input.description,
      expires_in_minutes: input.expiresInMinutes,
      redirect_url: input.redirectUrl,
      webhook_url: input.webhookUrl,
    };
    const result = await request<{
      id: string;
      link_url: string;
      status: "pending";
      amount_usdc: number;
      description: string | null;
      expires_at: string;
      source: "api";
    }>(this.baseUrl, "/api/v1/dev/payment-requests", {
      method: "POST",
      body: JSON.stringify(body),
      authHeader: this.authHeader(),
    });
    return {
      id: result.id,
      linkUrl: result.link_url,
      status: result.status,
      amountUsdc: result.amount_usdc,
      description: result.description,
      expiresAt: result.expires_at,
      source: result.source,
    };
  }

  async testPaymentRequest(input: CreatePaymentRequestInput): Promise<TestPaymentRequestResult> {
    const body = {
      amount_usdc: input.amountUsdc,
      description: input.description,
      expires_in_minutes: input.expiresInMinutes,
      redirect_url: input.redirectUrl,
      webhook_url: input.webhookUrl,
    };
    const result = await request<{
      sandbox: true;
      valid: boolean;
      amount_usdc: number;
      description: string | null;
      expires_in_minutes: number;
      redirect_url: string | null;
      webhook_url: string | null;
    }>(this.baseUrl, "/api/v1/dev/payment-requests/test", {
      method: "POST",
      body: JSON.stringify(body),
      authHeader: this.authHeader(),
    });
    return {
      sandbox: result.sandbox,
      valid: result.valid,
      amountUsdc: result.amount_usdc,
      description: result.description,
      expiresInMinutes: result.expires_in_minutes,
      redirectUrl: result.redirect_url,
      webhookUrl: result.webhook_url,
    };
  }

  async getPaymentRequest(id: string): Promise<GetPaymentRequestResult> {
    const result = await request<{
      id: string;
      status: GetPaymentRequestResult["status"];
      amount_usdc: number | null;
      description: string | null;
      expires_at: string | null;
      paid_at: string | null;
      has_redirect_url: boolean;
      link_url: string;
    }>(this.baseUrl, `/api/v1/dev/payment-requests/${encodeURIComponent(id)}`, {
      method: "GET",
      authHeader: this.authHeader(),
    });
    return {
      id: result.id,
      status: result.status,
      amountUsdc: result.amount_usdc,
      description: result.description,
      expiresAt: result.expires_at,
      paidAt: result.paid_at,
      hasRedirectUrl: result.has_redirect_url,
      linkUrl: result.link_url,
    };
  }

  async listPaymentRequests(params: ListPaymentRequestsParams = {}): Promise<GetPaymentRequestResult[]> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    const result = await request<{
      requests: Array<{
        id: string;
        status: GetPaymentRequestResult["status"];
        amount_usdc: number | null;
        description: string | null;
        expires_at: string | null;
        paid_at: string | null;
        has_redirect_url: boolean;
        link_url: string;
      }>;
    }>(this.baseUrl, `/api/v1/dev/payment-requests${qs ? `?${qs}` : ""}`, {
      method: "GET",
      authHeader: this.authHeader(),
    });
    return result.requests.map((r) => ({
      id: r.id,
      status: r.status,
      amountUsdc: r.amount_usdc,
      description: r.description,
      expiresAt: r.expires_at,
      paidAt: r.paid_at,
      hasRedirectUrl: r.has_redirect_url,
      linkUrl: r.link_url,
    }));
  }

  async verifyReturnToken(input: VerifyReturnTokenInput): Promise<VerifyReturnTokenResult> {
    return request<VerifyReturnTokenResult>(this.baseUrl, "/api/v1/dev/return-token/verify", {
      method: "POST",
      body: JSON.stringify({ token: input.token, payment_request_id: input.paymentRequestId }),
      authHeader: this.authHeader(),
    });
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const result = await request<{
      id: string;
      api_key: string;
      scopes: string[];
      created_at: string;
    }>(this.baseUrl, "/api/v1/dev/keys", {
      method: "POST",
      body: JSON.stringify({ scopes: input.scopes }),
      authHeader: this.authHeader(),
    });
    return {
      id: result.id,
      apiKey: result.api_key,
      scopes: result.scopes,
      createdAt: result.created_at,
    };
  }

  async listApiKeys(): Promise<ApiKeyMetadata[]> {
    const result = await request<{
      keys: Array<{
        id: string;
        display_prefix: string;
        scopes: string[];
        created_at: string;
        last_used_at: string | null;
      }>;
    }>(this.baseUrl, "/api/v1/dev/keys", {
      method: "GET",
      authHeader: this.authHeader(),
    });
    return result.keys.map((k) => ({
      id: k.id,
      displayPrefix: k.display_prefix,
      scopes: k.scopes,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    }));
  }

  async revokeApiKey(id: string): Promise<void> {
    await request<{ revoked: boolean }>(this.baseUrl, `/api/v1/dev/keys/${encodeURIComponent(id)}`, {
      method: "DELETE",
      authHeader: this.authHeader(),
    });
  }

  async getWebhookConfig(): Promise<WebhookConfig> {
    const result = await request<{ webhook_url: string | null; has_secret: boolean }>(
      this.baseUrl,
      "/api/v1/dev/webhook-config",
      { method: "GET", authHeader: this.authHeader() },
    );
    return { webhookUrl: result.webhook_url, hasSecret: result.has_secret };
  }

  async setWebhookUrl(webhookUrl: string): Promise<WebhookConfig> {
    const result = await request<{ webhook_url: string | null; has_secret: boolean }>(
      this.baseUrl,
      "/api/v1/dev/webhook-config",
      {
        method: "POST",
        body: JSON.stringify({ webhook_url: webhookUrl }),
        authHeader: this.authHeader(),
      },
    );
    return { webhookUrl: result.webhook_url, hasSecret: result.has_secret };
  }

  async listWebhookDeliveries(limit?: number): Promise<WebhookDeliveryRecord[]> {
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    const result = await request<{
      deliveries: Array<{
        event_type: string;
        webhook_url: string;
        status: string;
        attempts: number;
        response_code: number | null;
        created_at: string;
      }>;
    }>(this.baseUrl, `/api/v1/dev/webhook-deliveries${qs}`, {
      method: "GET",
      authHeader: this.authHeader(),
    });
    return result.deliveries.map((d) => ({
      eventType: d.event_type,
      webhookUrl: d.webhook_url,
      status: d.status,
      attempts: d.attempts,
      responseCode: d.response_code,
      createdAt: d.created_at,
    }));
  }

  async createPairingSession(input: CreatePairingSessionInput): Promise<CreatePairingSessionResult> {
    const result = await request<{
      session_id: string;
      pairing_code: string;
      approval_url: string;
      expires_at: string;
    }>(this.baseUrl, "/api/v1/dev/cli-auth/sessions", {
      method: "POST",
      body: JSON.stringify({ cli_display_name: input.cliDisplayName }),
    });
    return {
      sessionId: result.session_id,
      pairingCode: result.pairing_code,
      approvalUrl: result.approval_url,
      expiresAt: result.expires_at,
    };
  }

  async getPairingSessionStatus(sessionId: string): Promise<PairingSessionStatusResult> {
    const result = await request<{
      session_id: string;
      status: PairingSessionStatusResult["status"];
      cli_display_name: string;
      expires_at: string;
    }>(this.baseUrl, `/api/v1/dev/cli-auth/sessions/${encodeURIComponent(sessionId)}`, {
      method: "GET",
    });
    return {
      sessionId: result.session_id,
      status: result.status,
      cliDisplayName: result.cli_display_name,
      expiresAt: result.expires_at,
    };
  }

  async retrievePairingKey(sessionId: string): Promise<RetrievePairingKeyResult> {
    const result = await request<{ api_key: string }>(
      this.baseUrl,
      `/api/v1/dev/cli-auth/sessions/${encodeURIComponent(sessionId)}/key`,
      { method: "POST" },
    );
    return { apiKey: result.api_key };
  }
}

/** Creates a typed, User-API-Key-authenticated {@link ZendClient}. */
export function createZendClient(config: ZendClientConfig): ZendClient {
  return new ZendClientImpl(config);
}

/**
 * Convenience free function matching the PRD's illustrative
 * `createZendPayment()` usage. Equivalent to
 * `createZendClient(config).createZendPayment(input)`.
 */
export async function createZendPayment(
  config: ZendClientConfig,
  input: CreatePaymentRequestInput,
): Promise<CreatePaymentRequestResult> {
  return createZendClient(config).createZendPayment(input);
}
