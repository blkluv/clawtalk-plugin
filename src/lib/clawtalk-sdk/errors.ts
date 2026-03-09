/**
 * SDK-level error types for ClawTalkClient.
 *
 * These are HTTP/API errors only. Plugin-level errors (ToolError, WebSocketError, etc.)
 * remain in src/utils/errors.ts.
 */

export class ApiError extends Error {
  readonly statusCode: number;
  readonly responseBody?: string;

  constructor(statusCode: number, message: string, responseBody?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }

  static unauthorized(message = 'Invalid or expired API key'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Insufficient permissions'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(resource: string): ApiError {
    return new ApiError(404, `${resource} not found`);
  }

  static rateLimited(retryAfter?: number): ApiError {
    const msg = retryAfter ? `Rate limited. Retry after ${retryAfter}s` : 'Rate limited. Try again later';
    return new ApiError(429, msg, retryAfter !== undefined ? String(retryAfter) : undefined);
  }

  static serverError(message = 'ClawTalk server error'): ApiError {
    return new ApiError(500, message);
  }
}
