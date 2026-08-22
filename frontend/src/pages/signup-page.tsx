import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { InlineError } from '@/components/page-renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-handler';
import { useAuth } from '@/providers/auth-provider';
import { AuthLayout } from './login-page';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    try {
      await signup(email, password, name.trim() || undefined);
      navigate('/wallet', { replace: true });
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
          <CardTitle as="h1" className="text-lg">Create an account</CardTitle>
          <CardDescription>
            Signing up creates your wallet with all three credit currencies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

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
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">At least 8 characters.</p>
            </div>

            <InlineError error={error} />

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="size-4" aria-hidden />
              )}
              Create account
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
