/**
 * Uniform error type thrown by every {@link ZendClient} method.
 *
 * Parses the backend's `{"error": "CODE", "message": "..."}` shape. Network
 * or timeout failures use `code: "NETWORK_ERROR"`.
 */
export class ZendPaymentError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;

  constructor(code: string, message: string, statusCode?: number) {
    super(message);
    this.name = "ZendPaymentError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
