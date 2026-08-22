/**
 * Where the auth token lives.
 *
 * localStorage is the pragmatic choice for a take-home: it survives a reload,
 * and the Stripe redirect leaves and re-enters the app, so an in-memory token
 * would log the user out on the way back from Checkout. A production build would
 * put the token in an httpOnly cookie instead — localStorage is readable by any
 * script that gets injected into the page.
 */
const TOKEN_KEY = 'culturex.token';
const USER_KEY = 'culturex.user';

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function readUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function writeSession(token: string, user: SessionUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Private browsing with storage disabled: the session simply lasts for this
    // page view rather than failing the login.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Nothing to clean up.
  }
}
