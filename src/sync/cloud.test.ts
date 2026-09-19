import { describe, expect, it } from 'vitest';
import { authError, parseAuthRedirect } from './cloud';

describe('emailed-link redirects', () => {
  const site = 'https://life-os-game.vercel.app';

  it('ignores ordinary page loads', () => {
    expect(parseAuthRedirect(`${site}/`)).toBeNull();
    expect(parseAuthRedirect(`${site}/#/chronicle`)).toBeNull();
  });

  it('recognizes a PKCE sign-in link', () => {
    expect(parseAuthRedirect(`${site}/?code=abc123`)).toEqual({ error: null, recovery: false });
  });

  it('recognizes a password-reset link', () => {
    expect(parseAuthRedirect(`${site}/?flow=recovery&code=abc123`)).toEqual({ error: null, recovery: true });
    expect(parseAuthRedirect(`${site}/#access_token=t&type=recovery`)).toEqual({ error: null, recovery: true });
  });

  it('turns expired/used links into a friendly message', () => {
    const r = parseAuthRedirect(`${site}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    expect(r?.error).toMatch(/expired or was already used/);
    const q = parseAuthRedirect(`${site}/?error=server_error&error_description=Something+odd`);
    expect(q?.error).toBe('Something odd');
  });
});

describe('auth error messages', () => {
  const msg = (e: Parameters<typeof authError>[0]) => authError(e).message;

  it('explains the common cases in plain words', () => {
    expect(msg({ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 })).toBe('Wrong email or password.');
    expect(msg({ message: 'User already registered', code: 'user_already_exists', status: 422 })).toMatch(/already exists/);
    expect(msg({ message: 'Password should be at least 8 characters.', code: 'weak_password', status: 422 })).toMatch(/stronger password/);
    expect(msg({ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 })).toMatch(/password, which never needs an email/);
    expect(msg({ message: 'Token has expired or is invalid', code: 'otp_expired', status: 403 })).toMatch(/code is invalid or has expired/);
  });

  it('classifies network failures as offline', () => {
    expect(authError({ message: 'Failed to fetch' }).kind).toBe('offline');
  });
});
