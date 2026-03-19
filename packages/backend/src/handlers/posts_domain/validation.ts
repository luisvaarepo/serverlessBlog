/**
 * Removes control characters and trims single-line user input.
 */
export function sanitizeSingleLineInput(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Removes unsafe control characters while preserving markdown line breaks.
 */
export function sanitizePostContent(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/**
 * Validate create/update post input.
 */
export function validatePostPayload(payload: Record<string, unknown>): [boolean, string] {
  const title = sanitizeSingleLineInput(payload.title);
  const content = sanitizePostContent(payload.content);
  const published = payload.published;

  if (typeof title !== 'string' || title.trim().length < 3) {
    return [false, 'title must be a string with at least 3 characters'];
  }

  if (typeof content !== 'string' || content.trim().length < 3) {
    return [false, 'content must be a string with at least 3 characters'];
  }

  if (published !== undefined && typeof published !== 'boolean') {
    return [false, 'published must be a boolean when provided'];
  }

  return [true, ''];
}

/**
 * Validate register/login credential payload.
 */
export function validateCredentials(payload: Record<string, unknown>): [boolean, string] {
  const identity = sanitizeSingleLineInput(payload.email ?? payload.username).toLowerCase();
  const password = typeof payload.password === 'string' ? payload.password.trim() : payload.password;
  const role = payload.role;

  if (typeof identity !== 'string' || identity.trim().length < 3) {
    return [false, 'email must be a string with at least 3 characters'];
  }

  if (typeof password !== 'string' || password.length < 6) {
    return [false, 'password must be a string with at least 6 characters'];
  }

  if (role !== undefined && role !== 'author' && role !== 'reader') {
    return [false, "role must be either 'author' or 'reader'"];
  }

  return [true, ''];
}
