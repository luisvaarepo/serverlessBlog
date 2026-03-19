/**
/**
 * Validate create/update post input.
 */
export function validatePostPayload(payload: Record<string, unknown>): [boolean, string] {
  const title = payload.title;
  const content = payload.content;
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
  const identity = payload.email ?? payload.username;
  const password = payload.password;
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
