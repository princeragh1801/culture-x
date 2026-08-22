import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';

/**
 * Gate on every wallet and campaign route.
 *
 * It waits for the stored token to be revalidated before deciding, otherwise a
 * reload on the wallet page would bounce a logged-in user to the login screen
 * for the split second before /auth/me answers.
 *
 * This is a convenience, not a security boundary — the API rejects an
 * unauthenticated request regardless of what the client renders.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isRestoring } = useAuth();
  const location = useLocation();

  if (isRestoring) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy>
        <Loader2 className="text-primary size-6 animate-spin" aria-hidden />
        <span className="sr-only">Restoring your session</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    // `from` lets the login screen send the user back where they were headed.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

/** The mirror image: keeps a signed-in user off the login and signup screens. */
export function PublicOnlyRoute() {
  const { isAuthenticated, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-busy>
        <Loader2 className="text-primary size-6 animate-spin" aria-hidden />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/wallet" replace /> : <Outlet />;
}
