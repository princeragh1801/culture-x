import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiHandler, setUnauthorizedHandler } from '@/lib/api-handler';
import { clearSession, readToken, readUser, writeSession, type SessionUser } from '@/lib/session';
import type { AuthResponse } from '@/types/api';

interface AuthContextValue {
  user: SessionUser | null;
  isAuthenticated: boolean;
  /** True until the stored token has been checked against the API. */
  isRestoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the session.
 *
 * On mount it revalidates a stored token against GET /api/auth/me rather than
 * trusting localStorage: the token may have expired while the tab was closed,
 * and finding that out on load is better than on the user's first click.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => readUser());
  const [isRestoring, setIsRestoring] = useState<boolean>(() => Boolean(readToken()));

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  // A 401 from any request anywhere ends the session, in one place.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!readToken()) {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;

    void apiHandler<{ user: SessionUser }>({ endpoint: '/auth/me' })
      .then((response) => {
        if (!cancelled) setUser(response.user);
      })
      .catch(() => {
        // apiHandler already cleared the session on a 401.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(
    async (endpoint: string, payload: Record<string, unknown>) => {
      const response = await apiHandler<AuthResponse>({ endpoint, method: 'POST', payload });

      const sessionUser: SessionUser = {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
      };

      writeSession(response.token, sessionUser);
      setUser(sessionUser);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isRestoring,
      login: (email, password) => authenticate('/auth/login', { email, password }),
      signup: (email, password, name) =>
        authenticate('/auth/signup', { email, password, ...(name ? { name } : {}) }),
      logout,
    }),
    [user, isRestoring, authenticate, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }

  return context;
}
