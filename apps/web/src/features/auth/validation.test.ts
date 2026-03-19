import { MIN_AUTH_PASSWORD_LENGTH, sanitizeAuthPayload, sanitizeSingleLineInput, validateAuthInput } from './validation';
import { describe, expect, it } from 'vitest';

describe('auth validation helpers', () => {
  // Purpose: Ensure single-line sanitization removes control characters and trims repeated whitespace.
  it('sanitizes single-line inputs', () => {
    expect(sanitizeSingleLineInput('  user\n\tname@example.com  ')).toBe('user name@example.com');
  });

  // Purpose: Validate friendly message for malformed email values.
  it('returns friendly message for invalid email', () => {
    expect(validateAuthInput({ email: 'invalid-email', password: 'password123' })).toBe('Please enter a valid email address.');
  });

  // Purpose: Validate friendly message for short password values.
  it('returns friendly message for short password', () => {
    expect(validateAuthInput({ email: 'user@example.com', password: '123' })).toBe(
      `Password must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters.`
    );
  });

  // Purpose: Normalize auth payload before network requests.
  it('sanitizes auth payload values', () => {
    expect(
      sanitizeAuthPayload({
        email: ' USER@Example.com\n',
        password: '  password123  ',
        role: 'author'
      })
    ).toEqual({
      email: 'user@example.com',
      password: 'password123',
      role: 'author'
    });
  });
});
