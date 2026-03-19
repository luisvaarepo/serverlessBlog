import { type ChangeEvent } from 'react';
import type { Page, Theme } from '../../app/types';

interface NavbarProps {
  isDarkTheme: boolean;
  token: string | null;
  currentUsername: string | null;
  isMenuOpen: boolean;
  theme: Theme;
  onNavigate: (page: Page) => void;
  onToggleMenu: () => void;
  onThemeChange: (theme: Theme) => void;
  onLogout: () => void;
}

/**
 * Displays primary navigation actions, account controls, and theme selector.
 * @param isDarkTheme Indicates whether dark theme styles should be used.
 * @param token Current auth token; controls authenticated actions visibility.
 * @param currentUsername Username decoded from token for UI labels.
 * @param isMenuOpen Whether the dropdown menu is currently visible.
 * @param theme Active theme selection.
 * @param onNavigate Callback used to switch app pages.
 * @param onToggleMenu Callback used to open/close the menu.
 * @param onThemeChange Callback used to persist selected theme.
 * @param onLogout Callback used to clear auth session.
 */
function Navbar({
  isDarkTheme,
  token,
  currentUsername,
  isMenuOpen,
  theme,
  onNavigate,
  onToggleMenu,
  onThemeChange,
  onLogout
}: NavbarProps) {
  return (
    <nav className={`border-b ${isDarkTheme ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between p-4">
        <button className={`text-xl font-bold ${isDarkTheme ? 'text-slate-100' : 'text-slate-900'}`} onClick={() => onNavigate('home')} type="button">
          Serverless Blog
        </button>
        <div className="hidden items-center gap-2 lg:flex">
          <button
            className="rounded px-3 py-2 text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
            onClick={() => onNavigate('home')}
            type="button"
          >
            Home
          </button>
          {token && (
            <button
              className="rounded px-3 py-2 text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
              onClick={() => onNavigate('create')}
              type="button"
            >
              Create Post
            </button>
          )}
          <button
            className="rounded px-3 py-2 text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
            onClick={() => onNavigate('posts')}
            type="button"
          >
            All Posts
          </button>

          <div className="relative">
            <button
              className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={onToggleMenu}
              type="button"
            >
              Menu
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {token && (
                  <button
                    className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => onNavigate('my-posts')}
                    type="button"
                  >
                    {currentUsername ? `${currentUsername}'s Posts` : 'My Posts'}
                  </button>
                )}
                <button
                  className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => onNavigate('preferences')}
                  type="button"
                >
                  Preferences
                </button>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Theme</span>
                  <select
                    value={theme}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => onThemeChange(event.target.value as Theme)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {!token ? (
            <>
              <button
                className="rounded px-3 py-2 text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
                onClick={() => onNavigate('login')}
                type="button"
              >
                Login
              </button>
              <button
                className="rounded bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                onClick={() => onNavigate('register')}
                type="button"
              >
                Register
              </button>
            </>
          ) : (
            <button
              className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={onLogout}
              type="button"
            >
              Logout
            </button>
          )}
        </div>
        <button
          className="inline-flex items-center justify-center rounded border border-slate-300 p-2 text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 lg:hidden"
          onClick={onToggleMenu}
          type="button"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {isMenuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </div>
      {isMenuOpen && (
        <div className="space-y-2 border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-800 lg:hidden">
          <button
            className="w-full rounded px-3 py-2 text-left text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
            onClick={() => onNavigate('home')}
            type="button"
          >
            Home
          </button>
          {token && (
            <button
              className="w-full rounded px-3 py-2 text-left text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
              onClick={() => onNavigate('create')}
              type="button"
            >
              Create Post
            </button>
          )}
          <button
            className="w-full rounded px-3 py-2 text-left text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
            onClick={() => onNavigate('posts')}
            type="button"
          >
            All Posts
          </button>
          {token && (
            <button
              className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => onNavigate('my-posts')}
              type="button"
            >
              {currentUsername ? `${currentUsername}'s Posts` : 'My Posts'}
            </button>
          )}
          <button
            className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onNavigate('preferences')}
            type="button"
          >
            Preferences
          </button>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Theme</span>
            <select
              value={theme}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => onThemeChange(event.target.value as Theme)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          {!token ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                className="rounded px-3 py-2 text-sm font-medium !text-slate-900 hover:bg-slate-100 dark:!text-slate-300 dark:hover:bg-slate-800"
                onClick={() => onNavigate('login')}
                type="button"
              >
                Login
              </button>
              <button
                className="rounded bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                onClick={() => onNavigate('register')}
                type="button"
              >
                Register
              </button>
            </div>
          ) : (
            <button
              className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={onLogout}
              type="button"
            >
              Logout
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

export default Navbar;
