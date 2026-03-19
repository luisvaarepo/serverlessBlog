import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AuthPage from './AuthPage';
import type { UserRole } from '../types';

interface AuthPageOverrides {
  mode?: 'login' | 'register';
  role?: UserRole;
  onSetRole?: (value: UserRole) => void;
  onLogin?: () => void;
  onRegister?: () => void;
}

/**
 * Builds a full AuthPage props object with optional test overrides.
 * @param overrides Targeted properties to customize per test.
 * @returns Complete AuthPage props for rendering and interaction checks.
 */
function buildProps(overrides: AuthPageOverrides = {}) {
  return {
    mode: 'register' as const,
    email: 'user@example.com',
    password: 'password123',
    role: 'reader' as UserRole,
    isAuthenticating: false,
    onSetEmail: vi.fn(),
    onSetPassword: vi.fn(),
    onSetRole: vi.fn<(value: UserRole) => void>(),
    onLogin: vi.fn(),
    onRegister: vi.fn(),
    ...overrides
  };
}

/**
 * Finds the first React host element by tag name within a React node tree.
 * @param node Root node to inspect.
 * @param tagName Host tag name such as `select` or `button`.
 * @returns Matching React element when found; otherwise `null`.
 */
function findHostElement(node: ReactNode, tagName: string): ReactElement | null {
  if (!isValidElement(node)) {
    return null;
  }

  if (typeof node.type === 'string' && node.type === tagName) {
    return node;
  }

  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findHostElement(child, tagName);
      if (found) {
        return found;
      }
    }

    return null;
  }

  return findHostElement(children, tagName);
}

describe('AuthPage role selection', () => {
  // Purpose: Ensure register mode exposes both reader and author role options.
  it('renders reader and author options in register mode', () => {
    const html = renderToStaticMarkup(createElement(AuthPage, buildProps({ mode: 'register', role: 'reader' })));

    expect(html).toContain('<option value="reader" selected="">Reader</option>');
    expect(html).toContain('<option value="author">Author</option>');
  });

  // Purpose: Ensure login mode hides registration-only role selection controls.
  it('does not render role selector in login mode', () => {
    const html = renderToStaticMarkup(createElement(AuthPage, buildProps({ mode: 'login' })));

    expect(html).not.toContain('<select');
    expect(html).not.toContain('<option value="reader"');
    expect(html).not.toContain('<option value="author"');
  });

  // Purpose: Ensure select changes propagate selected role to parent state callback.
  it('calls onSetRole when selecting author role', () => {
    const onSetRole = vi.fn<(value: UserRole) => void>();
    const tree = AuthPage(buildProps({ mode: 'register', role: 'reader', onSetRole }));
    const select = findHostElement(tree, 'select');

    expect(select).not.toBeNull();
    const handleChange = select?.props.onChange as ((event: { target: { value: string } }) => void) | undefined;
    expect(typeof handleChange).toBe('function');

    handleChange?.({ target: { value: 'author' } });
    expect(onSetRole).toHaveBeenCalledWith('author');
  });

  // Purpose: Ensure login mode submit button triggers login callback, not register callback.
  it('calls onLogin when submit button is clicked in login mode', () => {
    const onLogin = vi.fn();
    const onRegister = vi.fn();
    const tree = AuthPage(buildProps({ mode: 'login', onLogin, onRegister }));
    const button = findHostElement(tree, 'button');

    expect(button).not.toBeNull();
    const handleClick = button?.props.onClick as (() => void) | undefined;
    expect(typeof handleClick).toBe('function');

    handleClick?.();
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onRegister).not.toHaveBeenCalled();
  });
});
