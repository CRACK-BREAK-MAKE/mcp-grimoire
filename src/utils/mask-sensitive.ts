/**
 * Utility functions for masking sensitive data in logs
 *
 * @module utils/mask-sensitive
 */

/**
 * Mask a sensitive value for logging
 * Shows first N characters and masks the rest
 *
 * @param value - The sensitive value to mask
 * @param visibleChars - Number of characters to show (default: 4)
 * @returns Masked string like "abcd***"
 *
 * @example
 * ```typescript
 * maskSensitive('my-secret-token-12345'); // Returns: "my-s***"
 * maskSensitive('short', 2);              // Returns: "sh***"
 * maskSensitive(null);                    // Returns: "***"
 * ```
 */
export function maskSensitive(value: string | null | undefined, visibleChars: number = 4): string {
  if (value == null || value.length === 0) {
    return '***';
  }

  if (value.length <= visibleChars) {
    return '***';
  }

  return value.substring(0, visibleChars) + '***';
}

/**
 * Mask base64-encoded credentials
 * Useful for Basic Auth credentials
 *
 * @param base64Value - The base64-encoded credential
 * @returns Masked base64 string
 *
 * @example
 * ```typescript
 * maskBase64('dXNlcjpwYXNzd29yZA=='); // Returns: "dXNl***"
 * ```
 */
export function maskBase64(base64Value: string): string {
  return maskSensitive(base64Value, 4);
}

/**
 * Mask an Authorization header value
 * Preserves the auth type (Bearer, Basic, etc.) but masks the credential
 *
 * @param headerValue - The full Authorization header value
 * @returns Masked header like "Bearer abcd***"
 *
 * @example
 * ```typescript
 * maskAuthHeader('Bearer my-secret-token-12345'); // Returns: "Bearer my-s***"
 * maskAuthHeader('Basic dXNlcjpwYXNzd29yZA==');   // Returns: "Basic dXNl***"
 * ```
 */
export function maskAuthHeader(headerValue: string | null | undefined): string {
  if (headerValue == null || headerValue.length === 0) {
    return '***';
  }

  const parts = headerValue.split(' ');
  if (parts.length !== 2) {
    return '***';
  }

  const [type, credential] = parts;
  return `${type} ${maskSensitive(credential, 4)}`;
}

/**
 * Mask all sensitive headers in a headers object
 * Masks Authorization, X-API-Key, and any header containing "token", "key", "secret", or "password"
 *
 * @param headers - Headers object that may contain sensitive values
 * @returns New headers object with sensitive values masked
 *
 * @example
 * ```typescript
 * maskHeaders({
 *   'Authorization': 'Bearer secret-token',
 *   'X-API-Key': 'my-api-key',
 *   'Content-Type': 'application/json'
 * });
 * // Returns: {
 * //   'Authorization': 'Bearer secr***',
 * //   'X-API-Key': 'my-a***',
 * //   'Content-Type': 'application/json'
 * // }
 * ```
 */
export function maskHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  const masked: Record<string, string> = {};
  const sensitivePatterns = /authorization|token|key|secret|password|credential/i;

  for (const [key, value] of Object.entries(headers)) {
    if (sensitivePatterns.test(key)) {
      // Special handling for Authorization header to preserve the type
      if (key.toLowerCase() === 'authorization') {
        masked[key] = maskAuthHeader(value);
      } else {
        masked[key] = maskSensitive(value, 4);
      }
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
