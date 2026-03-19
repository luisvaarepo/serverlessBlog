/**
 * Return the route path from an API Gateway event.
 */
export function getPath(event: ApiEvent): string {
  return (event.resource ?? event.path ?? '').trim();
}

/**
 * Normalize a path so route matching is predictable.
 */
export function canonicalizePath(path: string): string {
  if (!path) {
    return '/';
  }

  const normalized = path.trim();
  if (normalized.length > 1) {
    return normalized.replace(/\/+$/, '');
  }

  return normalized || '/';
}

/**
 * Parse JSON body and return a payload plus optional error message.
 */
export function parseBody(event: ApiEvent): [Record<string, unknown>, string | null] {
  const rawBody = event.body ?? '{}';
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return [parsed as Record<string, unknown>, null];
    }

    return [{}, 'invalid JSON payload'];
  } catch {
    return [{}, 'invalid JSON payload'];
  }
}

/**
 * Extract query string parameters and keep only string values.
 */
export function getQueryParams(event: ApiEvent): Record<string, string> {
  const rawParams = event.queryStringParameters;
  if (!rawParams || typeof rawParams !== 'object') {
    return {};
  }

  const parsed: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === 'string') {
      parsed[String(key)] = value;
    }
  }

  return parsed;
}

/**
 * Interpret common truthy text values.
 */
export function parseBool(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return new Set(['1', 'true', 'yes', 'on']).has(value.trim().toLowerCase());
}

/**
 * Resolve a post id from either route params or raw path.
 */
export function extractPostId(path: string, event: ApiEvent): string | null {
  if (path === '/api/posts/{id}') {
    const postId = event.pathParameters?.id;
    if (typeof postId === 'string' && postId.trim()) {
      return decodeURIComponent(postId.trim());
    }

    return null;
  }

  if (path.startsWith('/api/posts/')) {
    const candidate = path.slice('/api/posts/'.length).trim();
    if (!candidate) {
      return null;
    }

    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      return null;
    }

    return decodeURIComponent(candidate);
  }

  return null;
}

/**
 * Parse a positive integer and return default when invalid.
 */
export function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Minimal API Gateway event shape used by this handler.
 */
export interface ApiEvent {
  httpMethod?: string;
  resource?: string;
  path?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
}
