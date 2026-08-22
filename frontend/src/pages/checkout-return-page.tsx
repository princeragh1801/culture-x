import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageRenderer } from '@/components/page-renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { formatCredits, formatPaise } from '@/lib/format';
import type { Purchase } from '@/types/api';

/** Stops polling rather than spinning forever if a webhook never arrives. */
const MAX_POLLS = 20;
const POLL_INTERVAL_MS = 1500;

/**
 * Where Stripe sends the browser back to.
 *
 * This page grants nothing, and that is the point. It polls the purchase and
 * waits for the backend to tell it a verified webhook has granted the credits.
 * The `outcome=success` in the URL is only a hint about what the user did on
 * Stripe's page — anyone can type it, so nothing is decided by it.
 */
export function CheckoutReturnPage() {
  const [searchParams] = useSearchParams();
  const purchaseId = searchParams.get('purchaseId');
  const outcome = searchParams.get('outcome');

  const [pollCount, setPollCount] = useState(0);

  const purchase = useApi<{ purchase: Purchase }>(
    { endpoint: `/credits/purchases/${purchaseId ?? ''}` },
    { enabled: Boolean(purchaseId), deps: [purchaseId, pollCount] },
  );

  const status = purchase.data?.purchase.status;
  const isSettled = status === 'PAID' || status === 'FAILED';
  const hasGivenUp = pollCount >= MAX_POLLS;

  // Keeps the interval from being restarted by every render.
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!purchaseId || isSettled || hasGivenUp || outcome === 'cancelled') return;

    timer.current = window.setTimeout(() => setPollCount((count) => count + 1), POLL_INTERVAL_MS);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [purchaseId, isSettled, hasGivenUp, outcome, pollCount]);

  if (!purchaseId) {
    return (
      <Card>
        <CardContent className="space-y-4 py-12 text-center">
          <p className="font-medium">No purchase to show</p>
          <p className="text-muted-foreground text-sm">This page needs a purchase to follow.</p>
          <Button asChild>
            <Link to="/wallet">Back to wallet</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageRenderer
        status={purchase.isInitialLoading ? 'loading' : purchase.status}
        error={purchase.error}
        onRetry={purchase.refetch}
        loadingLabel="Checking your payment"
        skeletonRows={2}
      >
        {purchase.data ? (
          <Outcome
            purchase={purchase.data.purchase}
            wasCancelled={outcome === 'cancelled'}
            hasGivenUp={hasGivenUp}
          />
        ) : null}
      </PageRenderer>
    </div>
  );
}

function Outcome({
  purchase,
  wasCancelled,
  hasGivenUp,
}: {
  purchase: Purchase;
  wasCancelled: boolean;
  hasGivenUp: boolean;
}) {
  const summary = `${formatCredits(purchase.credits)} ${purchase.currency?.name ?? 'credits'} · ${formatPaise(purchase.amountPaise)}`;

  if (wasCancelled && purchase.status !== 'PAID') {
    return (
      <StatusCard
        icon={<XCircle className="size-6" aria-hidden />}
        tone="muted"
        title="Payment cancelled"
        description={`Nothing was charged and no credits were added. ${summary}`}
      />
    );
  }

  if (purchase.status === 'PAID') {
    return (
      <StatusCard
        icon={<CheckCircle2 className="size-6" aria-hidden />}
        tone="success"
        title="Credits added"
        description={`${summary} — granted from ledger entry #${purchase.ledgerEntryId ?? '?'}.`}
      />
    );
  }

  if (purchase.status === 'FAILED' || purchase.status === 'EXPIRED') {
    return (
      <StatusCard
        icon={<XCircle className="size-6" aria-hidden />}
        tone="destructive"
        title={purchase.status === 'EXPIRED' ? 'Checkout expired' : 'Payment did not go through'}
        description={`No credits were added. ${summary}`}
      />
    );
  }

  if (hasGivenUp) {
    return (
      <StatusCard
        icon={<Clock className="size-6" aria-hidden />}
        tone="warning"
        title="Still waiting on Stripe"
        description={
          'Your payment may still be confirming. Credits are only ever added when Stripe confirms ' +
          'the payment, so this page will not add them on its own — reload the wallet in a moment.'
        }
      />
    );
  }

  return (
    <StatusCard
      icon={<Loader2 className="size-6 animate-spin" aria-hidden />}
      tone="muted"
      title="Waiting for Stripe to confirm"
      description={
        `${summary}. Credits are added only after Stripe's webhook confirms the payment, ` +
        'never from this redirect — so this page waits rather than assuming.'
      }
    />
  );
}

const TONES = {
  success: 'bg-success/10 text-success',
  destructive: 'bg-destructive/10 text-destructive',
  warning: 'bg-warning/15 text-warning-foreground',
  muted: 'bg-muted text-muted-foreground',
} as const;

function StatusCard({
  icon,
  tone,
  title,
  description,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <div className={`flex size-12 items-center justify-center rounded-full ${TONES[tone]}`}>
          {icon}
        </div>
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/wallet">Back to wallet</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/campaigns">Campaigns</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
