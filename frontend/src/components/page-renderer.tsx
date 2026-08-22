import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-handler';
import type { RequestStatus } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

/**
 * One component that owns the four states every page can be in: loading, error,
 * empty and success.
 *
 * Pages hand it the status from useApi and their content as children. Nothing
 * renders its own spinner or its own "something went wrong" panel, so the four
 * states look and behave the same everywhere and none of them can be forgotten.
 */

interface PageRendererProps {
  status: RequestStatus;
  error?: ApiError | null;
  /** True when the request succeeded but there is nothing to show. */
  isEmpty?: boolean;
  onRetry?: () => void;
  children: ReactNode;

  loadingLabel?: string;
  /** Rows of skeleton to show while loading; a table wants more than a form. */
  skeletonRows?: number;

  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;

  className?: string;
}

export function PageRenderer({
  status,
  error,
  isEmpty = false,
  onRetry,
  children,
  loadingLabel = 'Loading',
  skeletonRows = 3,
  emptyIcon,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  className,
}: PageRendererProps) {
  if (status === 'idle' || status === 'loading') {
    return (
      <div className={cn('space-y-4', className)} role="status" aria-live="polite" aria-busy>
        <span className="sr-only">{loadingLabel}</span>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {loadingLabel}
        </div>
        {Array.from({ length: skeletonRows }).map((_row, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (status === 'error' && error) {
    return <ErrorState error={error} onRetry={onRetry} className={className} />;
  }

  if (isEmpty) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            {emptyIcon ?? <Inbox className="size-6" aria-hidden />}
          </div>
          <div className="space-y-1">
            <p className="font-medium">{emptyTitle}</p>
            {emptyDescription ? (
              <p className="text-muted-foreground max-w-sm text-sm">{emptyDescription}</p>
            ) : null}
          </div>
          {emptyAction}
        </CardContent>
      </Card>
    );
  }

  return <div className={className}>{children}</div>;
}

function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: ApiError;
  onRetry?: () => void;
  className?: string;
}) {
  const isOffline = error.code === 'NETWORK_ERROR';

  return (
    <Card className={cn('border-destructive/30', className)}>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
          {isOffline ? <WifiOff className="size-6" aria-hidden /> : <AlertTriangle className="size-6" aria-hidden />}
        </div>
        <div className="space-y-1">
          <p className="font-medium">{isOffline ? 'Cannot reach the server' : 'Something went wrong'}</p>
          <p className="text-muted-foreground max-w-md text-sm">{error.message}</p>
          {/* The backend's stable error code, shown so a failure can be traced
              back to a specific branch without opening the network tab. */}
          <p className="text-muted-foreground/70 font-mono text-xs">
            {error.code}
            {error.status ? ` · ${error.status}` : ''}
          </p>
        </div>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry} className="mt-1">
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Inline banner for a failed action, where a whole-page error state is too much. */
export function InlineError({ error, className }: { error: ApiError | null; className?: string }) {
  if (!error) return null;

  return (
    <div
      role="alert"
      className={cn(
        'bg-destructive/10 text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        <p>{error.message}</p>
        {error.fieldErrors.length > 0 ? (
          <ul className="list-inside list-disc text-xs opacity-90">
            {error.fieldErrors.map((field) => (
              <li key={`${field.field}-${field.message}`}>
                {field.field}: {field.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
