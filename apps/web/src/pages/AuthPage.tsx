import { type ChangeEvent } from 'react';
import type { UserRole } from '../types';

interface AuthPageProps {
  mode: 'login' | 'register';
  email: string;
  password: string;
  role: UserRole;
  isAuthenticating: boolean;
  onSetEmail: (value: string) => void;
  onSetPassword: (value: string) => void;
  onSetRole: (value: UserRole) => void;
  onLogin: () => void;
  onRegister: () => void;
}

/**
 * Renders login/register form and delegates submit actions to parent state.
 * @param mode Determines whether the form acts as login or register.
 * @param email Current email input value.
 * @param password Current password input value.
 * @param role Selected role for account registration.
 * @param isAuthenticating Indicates pending authentication request.
 * @param onSetEmail Callback to update email field.
 * @param onSetPassword Callback to update password field.
 * @param onSetRole Callback to update role field.
 * @param onLogin Callback to start login flow.
 * @param onRegister Callback to start register flow.
 */
function AuthPage({
  mode,
  email,
  password,
  role,
  isAuthenticating,
  onSetEmail,
  onSetPassword,
  onSetRole,
  onLogin,
  onRegister
}: AuthPageProps) {
  return (
    <form className="space-y-3 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-slate-900/40" onSubmit={(event) => event.preventDefault()}>
      <h2 className="text-xl font-semibold">{mode === 'login' ? 'Login' : 'Register'}</h2>
      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onSetEmail(event.target.value)}
        required
      />
      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onSetPassword(event.target.value)}
        required
      />
      {mode === 'register' && (
        <select
          className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          value={role}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onSetRole(event.target.value as UserRole)}
        >
          <option value="reader">Reader</option>
          <option value="author">Author</option>
        </select>
      )}
      <button
        className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
        type="button"
        disabled={isAuthenticating}
        onClick={() => {
          if (mode === 'login') {
            onLogin();
            return;
          }

          onRegister();
        }}
      >
        {isAuthenticating && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white dark:border-slate-400 dark:border-t-slate-900" />}
        {isAuthenticating ? (mode === 'login' ? 'Logging in...' : 'Creating account...') : mode === 'login' ? 'Login' : 'Create account'}
      </button>
    </form>
  );
}

export default AuthPage;
