import { useState } from 'react';
import { CheckCircle2, Loader2, Megaphone, Plus, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { InlineError, PageRenderer } from '@/components/page-renderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/use-api';
import { useMutation } from '@/hooks/use-mutation';
import { formatCredits, formatDateTime } from '@/lib/format';
import type { Campaign, WalletResponse } from '@/types/api';

export function CampaignsPage() {
  const campaigns = useApi<{ campaigns: Campaign[] }>({ endpoint: '/campaigns' });
  const wallet = useApi<WalletResponse>({ endpoint: '/wallet' });

  const currencies = wallet.data?.balances.map((item) => item.currency) ?? [];
  const campaignBalance =
    wallet.data?.balances.find((item) => item.currency.module?.code === 'campaigns')?.balance ?? 0;

  function refreshAll() {
    void campaigns.refetch();
    void wallet.refetch();
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Fundable with Campaign Credits only, and fundable once."
        action={<CreateCampaignDialog onCreated={refreshAll} />}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
          <div className="flex items-center gap-2">
            <span className="bg-accent text-accent-foreground grid size-9 place-items-center rounded-lg">
              <Wallet className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Campaign Credits available</p>
              <p className="tabular text-xl font-semibold">{formatCredits(campaignBalance)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <PageRenderer
        status={campaigns.status}
        error={campaigns.error}
        onRetry={campaigns.refetch}
        loadingLabel="Loading your campaigns"
        skeletonRows={3}
        isEmpty={campaigns.data?.campaigns.length === 0}
        emptyIcon={<Megaphone className="size-6" aria-hidden />}
        emptyTitle="No campaigns yet"
        emptyDescription="Create one, then fund it from your Campaign Credits balance."
        emptyAction={<CreateCampaignDialog onCreated={refreshAll} />}
      >
        <ul className="grid gap-4 md:grid-cols-2">
          {campaigns.data?.campaigns.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard
                campaign={campaign}
                currencies={currencies}
                onFunded={refreshAll}
              />
            </li>
          ))}
        </ul>
      </PageRenderer>
    </>
  );
}

function CampaignCard({
  campaign,
  currencies,
  onFunded,
}: {
  campaign: Campaign;
  currencies: WalletResponse['balances'][number]['currency'][];
  onFunded: () => void;
}) {
  const isFunded = campaign.status === 'FUNDED';

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle as="h3" className="text-base">{campaign.name}</CardTitle>
          <Badge variant={isFunded ? 'default' : 'outline'} className="shrink-0 gap-1">
            {isFunded ? <CheckCircle2 className="size-3" aria-hidden /> : null}
            {campaign.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isFunded ? (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Funded</dt>
              <dd className="tabular font-medium">
                {formatCredits(campaign.fundedCredits ?? 0)} {campaign.currency?.name}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">When</dt>
              <dd>{formatDateTime(campaign.fundedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Ledger entry</dt>
              {/* Shown because it is the proof: the campaign points at the exact
                  ledger row that paid for it, and that row is unique. */}
              <dd className="tabular font-mono text-xs">#{campaign.ledgerEntryId}</dd>
            </div>
          </dl>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Created {formatDateTime(campaign.createdAt)}. Not funded yet.
            </p>
            <FundCampaignDialog
              campaign={campaign}
              currencies={currencies}
              onFunded={onFunded}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CreateCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');

  const { mutate, isPending, error, reset } = useMutation<{ name: string }, { campaign: Campaign }>(
    (variables) => ({ endpoint: '/campaigns', method: 'POST', payload: variables }),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      await mutate({ name: name.trim() });
      setIsOpen(false);
      setName('');
      onCreated();
    } catch {
      // Rendered inline below.
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          New campaign
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>Campaigns start as drafts and are funded separately.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Name</Label>
              <Input
                id="campaign-name"
                required
                maxLength={191}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Summer launch"
              />
            </div>
            <InlineError error={error} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || name.trim().length === 0}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Create campaign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FundCampaignDialog({
  campaign,
  currencies,
  onFunded,
}: {
  campaign: Campaign;
  currencies: WalletResponse['balances'][number]['currency'][];
  onFunded: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const campaignCurrency = currencies.find((item) => item.module?.code === 'campaigns');
  const [currencyId, setCurrencyId] = useState<number>(campaignCurrency?.id ?? 0);
  const [credits, setCredits] = useState('100');

  const { mutate, isPending, error, reset } = useMutation<
    { currencyId: number; credits: number },
    { campaign: Campaign }
  >((variables) => ({
    endpoint: `/campaigns/${campaign.id}/fund`,
    method: 'POST',
    payload: variables,
  }));

  const parsedCredits = Number.parseInt(credits, 10);
  const isValid = Number.isInteger(parsedCredits) && parsedCredits > 0 && currencyId > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      await mutate({ currencyId, credits: parsedCredits });
      setIsOpen(false);
      onFunded();
    } catch {
      // Rendered inline. CURRENCY_NOT_ALLOWED_FOR_MODULE and
      // INSUFFICIENT_CREDITS both land here with a readable message.
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          reset();
          setCurrencyId(campaignCurrency?.id ?? 0);
          setCredits('100');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full">Fund campaign</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Fund &ldquo;{campaign.name}&rdquo;</DialogTitle>
            <DialogDescription>
              A campaign can only be funded once, and only with Campaign Credits.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`fund-currency-${campaign.id}`}>Currency</Label>
              <Select value={String(currencyId)} onValueChange={(value) => setCurrencyId(Number(value))}>
                <SelectTrigger id={`fund-currency-${campaign.id}`} className="w-full">
                  <SelectValue placeholder="Choose a currency" />
                </SelectTrigger>
                <SelectContent>
                  {/* Every currency is listed on purpose, including the ones
                      this module cannot spend. Picking one of those is the
                      quickest way to see the isolation rule refuse it. */}
                  {currencies.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                      {item.module?.code === 'campaigns' ? '' : ' — not valid here'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`fund-credits-${campaign.id}`}>Credits</Label>
              <Input
                id={`fund-credits-${campaign.id}`}
                type="number"
                inputMode="numeric"
                min={1}
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
              />
            </div>

            <InlineError error={error} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Fund campaign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
