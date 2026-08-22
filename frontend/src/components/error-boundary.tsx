import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — used to recover on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a bug in one screen shows a readable panel
 * instead of a blank white page.
 *
 * This is for the failures useApi cannot represent: a bad render, a null
 * dereference, a component throwing during layout. Failed *requests* are not
 * exceptions here — they arrive as ApiError and are drawn by PageRenderer.
 *
 * Still a class component, because error boundaries are the one thing hooks
 * cannot express.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Where a real app would report to Sentry.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override componentDidUpdate(previous: Props): void {
    // Navigating away from a broken screen should not keep the error panel.
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
              <AlertOctagon className="size-6" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="font-medium">This screen hit an unexpected error</p>
              <p className="text-muted-foreground text-sm">
                The rest of the app still works. Reloading usually clears it.
              </p>
              <p className="text-muted-foreground/70 mt-2 font-mono text-xs break-words">
                {error.message}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => this.setState({ error: null })}>
                <RotateCcw className="size-4" aria-hidden />
                Try again
              </Button>
              <Button onClick={() => window.location.reload()}>Reload the page</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
