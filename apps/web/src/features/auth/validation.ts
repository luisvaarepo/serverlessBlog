import type { UserRole } from '../../types';

export const MIN_AUTH_PASSWORD_LENGTH = 6;

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthInput {
  email: string;
  password: string;
  role?: UserRole;
}

/**
 * Removes control characters and trims user-provided single-line values.
 * @param value Raw input value.
 * @returns Sanitized input string.
 */
export function sanitizeSingleLineInput(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Validates login/register inputs and returns a friendly message when invalid.
 * @param input Raw auth payload from UI state.
 * @returns Validation message or `null` when input is valid.
 */
export function validateAuthInput(input: AuthInput): string | null {
  const sanitizedEmail = sanitizeSingleLineInput(input.email).toLowerCase();
  const sanitizedPassword = input.password.trim();

  if (!sanitizedEmail) {
    return 'Please enter your email address.';
  }

  if (!SIMPLE_EMAIL_PATTERN.test(sanitizedEmail)) {
    return 'Please enter a valid email address.';
  }

  if (sanitizedPassword.length < MIN_AUTH_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters.`;
  }

  if (input.role !== undefined && input.role !== 'author' && input.role !== 'reader') {
    return 'Please choose a valid account role.';
  }

  return null;
}

/**
 * Returns a sanitized auth payload ready to send to the backend.
 * @param input Raw auth payload from UI state.
 * @returns Auth payload with normalized email and trimmed password.
 */
export function sanitizeAuthPayload(input: AuthInput): AuthInput {
  return {
    ...input,
    email: sanitizeSingleLineInput(input.email).toLowerCase(),
    password: input.password.trim()
  };
}
