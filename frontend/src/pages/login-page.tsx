import { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/app-shell';
import { InlineError } from '@/components/page-renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-handler';
import { useAuth } from '@/providers/auth-provider';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Set by ProtectedRoute when it bounced an unauthenticated visit.
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/wallet';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN_ERROR', 0, String(caught)));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-lg">Sign in</CardTitle>
          <CardDescription>Use the email and password you signed up with.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <InlineError error={error} />

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <LogIn className="size-4" aria-hidden />
              )}
              Sign in
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            No account yet?{' '}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="from-secondary/60 flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b to-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandMark />
          <p className="text-muted-foreground text-sm">
            Multi-currency credits wallet and campaign funding.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
