import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { ErrorBoundary } from '@/components/error-boundary';
import { ProtectedRoute, PublicOnlyRoute } from '@/components/protected-route';
import { CampaignsPage } from '@/pages/campaigns-page';
import { CheckoutReturnPage } from '@/pages/checkout-return-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { SignupPage } from '@/pages/signup-page';
import { WalletPage } from '@/pages/wallet-page';
import { AuthProvider } from '@/providers/auth-provider';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Outer boundary: catches anything the per-route one cannot, including a
            throw from the shell itself, so the page is never simply blank. */}
        <ErrorBoundary>
          <RoutedContent />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

function RoutedContent() {
  const location = useLocation();

  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Boundary path={location.pathname}><LoginPage /></Boundary>} />
        <Route path="/signup" element={<Boundary path={location.pathname}><SignupPage /></Boundary>} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/wallet" element={<Boundary path={location.pathname}><WalletPage /></Boundary>} />
          <Route path="/campaigns" element={<Boundary path={location.pathname}><CampaignsPage /></Boundary>} />
          <Route
            path="/checkout/return"
            element={<Boundary path={location.pathname}><CheckoutReturnPage /></Boundary>}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/wallet" replace />} />
    </Routes>
  );
}

/**
 * Per-route boundary, so one broken screen leaves the header and navigation
 * intact and the user can move somewhere else. Keying it on the path resets it
 * when they do.
 */
function Boundary({ path, children }: { path: string; children: React.ReactNode }) {
  return <ErrorBoundary resetKey={path}>{children}</ErrorBoundary>;
}
