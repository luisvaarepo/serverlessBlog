/**
 * Decodes a JWT payload and returns the `sub` claim value.
 * @param token JWT bearer token string.
 * @returns Username from token subject claim or `null` when invalid.
 */
export function decodeTokenSubject(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { sub?: string };
    if (typeof payload.sub === 'string' && payload.sub.trim() !== '') {
      return payload.sub;
    }

    return null;
  } catch {
    return null;
  }
}
