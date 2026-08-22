import { useState } from 'react';
import { Coins, Plus, ReceiptText, RefreshCw } from 'lucide-react';
import { BuyCreditsDialog } from '@/components/buy-credits-dialog';
import { LedgerTable } from '@/components/ledger-table';
import { PageHeader } from '@/components/page-header';
import { PageRenderer } from '@/components/page-renderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { formatCredits, formatPaise } from '@/lib/format';
import type { LedgerResponse, WalletResponse } from '@/types/api';

export function WalletPage() {
  const [currencyFilter, setCurrencyFilter] = useState<number | null>(null);

  const wallet = useApi<WalletResponse>({ endpoint: '/wallet' });

  const ledger = useApi<LedgerResponse>(
    {
      endpoint: '/wallet/ledger',
      params: { currencyId: currencyFilter ?? undefined, pageSize: 50 },
    },
    { deps: [currencyFilter] },
  );

  const currencies = wallet.data?.balances.map((item) => item.currency) ?? [];

  function refreshAll() {
    void wallet.refetch();
    void ledger.refetch();
  }

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Three separate credit currencies, each with its own balance and ledger."
        action={
          <>
            <Button variant="outline" onClick={refreshAll} disabled={wallet.isRefreshing}>
              <RefreshCw className={wallet.isRefreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {currencies.length > 0 ? <BuyCreditsDialog currencies={currencies} /> : null}
          </>
        }
      />

      <PageRenderer
        status={wallet.status}
        error={wallet.error}
        onRetry={wallet.refetch}
        loadingLabel="Loading your balances"
        skeletonRows={3}
        isEmpty={wallet.data?.balances.length === 0}
        emptyIcon={<Coins className="size-6" aria-hidden />}
        emptyTitle="No currencies configured"
        emptyDescription="The platform has no active credit currencies. Seed the database and refresh."
      >
        <section aria-label="Balances" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wallet.data?.balances.map(({ currency, balance }) => (
            <Card key={currency.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle as="h3" className="text-sm font-medium">{currency.name}</CardTitle>
                  {currency.module ? (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {currency.module.name}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="tabular text-3xl font-semibold tracking-tight">
                    {formatCredits(balance)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    credits · {formatPaise(currency.pricePerCreditPaise)} each
                  </p>
                </div>
                <BuyCreditsDialog
                  currencies={currencies}
                  initialCurrencyId={currency.id}
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      <Plus className="size-4" aria-hidden />
                      Top up
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ))}
        </section>
      </PageRenderer>

      <section aria-label="Ledger" className="mt-10">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="font-heading mr-auto text-lg font-semibold">Ledger</h2>
          <FilterChip
            label="All"
            isActive={currencyFilter === null}
            onClick={() => setCurrencyFilter(null)}
          />
          {currencies.map((currency) => (
            <FilterChip
              key={currency.id}
              label={currency.name}
              isActive={currencyFilter === currency.id}
              onClick={() => setCurrencyFilter(currency.id)}
            />
          ))}
        </div>

        <PageRenderer
          status={ledger.status}
          error={ledger.error}
          onRetry={ledger.refetch}
          loadingLabel="Loading your ledger"
          skeletonRows={4}
          isEmpty={ledger.data?.entries.length === 0}
          emptyIcon={<ReceiptText className="size-6" aria-hidden />}
          emptyTitle="No movements yet"
          emptyDescription="Every purchase and every campaign funding will show up here, tagged with its currency."
          emptyAction={
            currencies.length > 0 ? <BuyCreditsDialog currencies={currencies} /> : undefined
          }
        >
          <>
            <LedgerTable entries={ledger.data?.entries ?? []} />
            <p className="text-muted-foreground mt-3 text-xs">
              Showing {ledger.data?.entries.length ?? 0} of {ledger.data?.total ?? 0} entries. The
              balance above is the sum of this currency&rsquo;s entries.
            </p>
          </>
        </PageRenderer>
      </section>
    </>
  );
}

function FilterChip({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={isActive ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      aria-pressed={isActive}
    >
      {label}
    </Button>
  );
}
