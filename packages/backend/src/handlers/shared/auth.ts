import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Hash a plain password with PBKDF2 and return `salt$digest`.
 */
export function hashPassword(password: string, salt?: string): string {
  const effectiveSalt = salt ?? randomBytes(16).toString('hex');
  const digest = pbkdf2Sync(password, effectiveSalt, 100_000, 32, 'sha256').toString('hex');
  return `${effectiveSalt}$${digest}`;
}

/**
 * Check whether a plain password matches a previously stored hash.
 */
export function verifyPassword(storedHash: string, password: string): boolean {
  const [salt, digest] = storedHash.split('$', 2);
  if (!salt || !digest) {
    return false;
  }

  const expected = hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(`${salt}$${digest}`));
}

/**
 * Encode bytes using URL-safe Base64 without padding.
 */
function base64urlEncode(data: Buffer): string {
  return data.toString('base64url');
}

/**
 * Decode URL-safe Base64 to a buffer.
 */
function base64urlDecode(data: string): Buffer {
  return Buffer.from(data, 'base64url');
}

/**
 * Create a signed JWT-like access token containing username and expiry.
 */
export function createAccessToken(
  username: string,
  secret: string,
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: username, exp: Math.floor(Date.now() / 1000) + ttlSeconds };

  const headerEncoded = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const payloadEncoded = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = createHmac('sha256', secret).update(signatureInput).digest();

  return `${headerEncoded}.${payloadEncoded}.${base64urlEncode(signature)}`;
}

/**
 * Validate token signature and expiry, then return username when valid.
 */
export function decodeAccessToken(token: string, secret: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = createHmac('sha256', secret).update(signatureInput).digest();

  let incomingSignature: Buffer;
  try {
    incomingSignature = base64urlDecode(signatureEncoded);
  } catch {
    return null;
  }

  if (expectedSignature.length !== incomingSignature.length) {
    return null;
  }

  if (!timingSafeEqual(expectedSignature, incomingSignature)) {
    return null;
  }

  let payload: { sub?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(base64urlDecode(payloadEncoded).toString('utf-8')) as { sub?: unknown; exp?: unknown };
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return null;
  }

  return payload.sub;
}

/**
 * Read a Bearer token from request headers in a case-tolerant way.
 */
export function extractBearerToken(headers?: Record<string, string | undefined>): string | null {
  const authHeader = headers?.Authorization ?? headers?.authorization;
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ', 2);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const token = parts[1].trim();
  return token.length > 0 ? token : null;
}
