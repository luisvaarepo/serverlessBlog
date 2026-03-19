import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Navbar from './Navbar';
import type { Theme } from '../../app/types';

interface NavbarTestOverrides {
  token?: string | null;
  currentUsername?: string | null;
  isMenuOpen?: boolean;
  theme?: Theme;
}

/**
 * Builds a complete Navbar props object with optional test overrides.
 * @param overrides Targeted props to adjust per test scenario.
 * @returns Fully populated props for rendering.
 */
function buildNavbarProps(overrides: NavbarTestOverrides = {}) {
  return {
    isDarkTheme: false,
    token: null,
    currentUsername: null,
    isMenuOpen: false,
    theme: 'light' as Theme,
    onNavigate: vi.fn(),
    onToggleMenu: vi.fn(),
    onThemeChange: vi.fn(),
    onLogout: vi.fn(),
    ...overrides
  };
}

describe('Navbar responsive menu', () => {
  // Purpose: Ensure desktop navigation controls are hidden on medium/small breakpoints.
  it('hides desktop action row below large breakpoint', () => {
    const html = renderToStaticMarkup(createElement(Navbar, buildNavbarProps()));

    expect(html).toContain('hidden items-center gap-2 lg:flex');
  });

  // Purpose: Ensure burger trigger is visible only on medium/small breakpoints.
  it('renders a burger trigger for medium and small devices', () => {
    const html = renderToStaticMarkup(createElement(Navbar, buildNavbarProps()));

    expect(html).toContain('lg:hidden');
    expect(html).toContain('Open navigation menu');
  });

  // Purpose: Ensure mobile menu surfaces key links when opened.
  it('renders stacked mobile links when burger menu is open', () => {
    const html = renderToStaticMarkup(
      createElement(
        Navbar,
        buildNavbarProps({
          token: 'token',
          currentUsername: 'jane',
          isMenuOpen: true
        })
      )
    );

    expect(html).toContain('Close navigation menu');
    expect(html).toContain('Create Post');
    expect(html).toContain('All Posts');
    expect(html).toContain('jane&#x27;s Posts');
    expect(html).toContain('Preferences');
  });
});
