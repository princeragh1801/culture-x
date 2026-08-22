import { useMemo, useState } from 'react';
import { CreditCard, Loader2, ShoppingCart } from 'lucide-react';
import { InlineError } from '@/components/page-renderer';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMutation } from '@/hooks/use-mutation';
import { formatCredits, formatPaise } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Currency, Purchase } from '@/types/api';

type Mode = 'plan' | 'quantity';

interface BuyCreditsDialogProps {
  currencies: Currency[];
  /** Preselects the currency when opened from a specific balance card. */
  initialCurrencyId?: number;
  trigger?: React.ReactNode;
}

/**
 * Pick a currency, then either a bundle or a quantity, then go to Stripe.
 *
 * The rupee figure shown here is only a preview. The server recomputes the
 * amount from the currency and plan rows when it creates the session, so a
 * tampered request can change the quantity but never the price.
 */
export function BuyCreditsDialog({ currencies, initialCurrencyId, trigger }: BuyCreditsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currencyId, setCurrencyId] = useState<number>(
    initialCurrencyId ?? currencies[0]?.id ?? 0,
  );
  const [mode, setMode] = useState<Mode>('plan');
  const [planId, setPlanId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('100');

  const currency = useMemo(
    () => currencies.find((item) => item.id === currencyId) ?? currencies[0],
    [currencies, currencyId],
  );

  const parsedQuantity = Number.parseInt(quantity, 10);
  const isQuantityValid = Number.isInteger(parsedQuantity) && parsedQuantity > 0;

  const selectedPlan = currency?.plans.find((plan) => plan.id === planId) ?? null;

  const previewPaise =
    mode === 'plan'
      ? (selectedPlan?.pricePaise ?? null)
      : isQuantityValid && currency
        ? parsedQuantity * currency.pricePerCreditPaise
        : null;

  const previewCredits =
    mode === 'plan' ? (selectedPlan?.credits ?? null) : isQuantityValid ? parsedQuantity : null;

  const { mutate, isPending, error, reset } = useMutation<
    { currencyId: number; planId?: number; quantity?: number },
    { purchase: Purchase; checkoutUrl: string }
  >((variables) => ({
    endpoint: '/credits/purchases',
    method: 'POST',
    payload: variables,
    headers: {
      // A per-attempt key, so a double-submit or a retry after a dropped
      // response reuses the same purchase and the same Stripe session rather
      // than creating a second payable one.
      'Idempotency-Key': `buy-${crypto.randomUUID()}`,
    },
  }));

  const canSubmit = mode === 'plan' ? Boolean(selectedPlan) : isQuantityValid;

  async function handleSubmit() {
    if (!currency || !canSubmit) return;

    const variables =
      mode === 'plan'
        ? { currencyId: currency.id, planId: selectedPlan!.id }
        : { currencyId: currency.id, quantity: parsedQuantity };

    const result = await mutate(variables);

    // Leave the app for Stripe's hosted page. Nothing is granted by coming back
    // — the return page polls the purchase and waits for the webhook.
    window.location.href = result.checkoutUrl;
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);

    if (open) {
      reset();
      setCurrencyId(initialCurrencyId ?? currencies[0]?.id ?? 0);
      setMode('plan');
      setPlanId(null);
      setQuantity('100');
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <ShoppingCart className="size-4" aria-hidden />
            Buy credits
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buy credits</DialogTitle>
          <DialogDescription>
            Payment happens on Stripe. Credits appear once Stripe confirms it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={String(currencyId)}
              onValueChange={(value) => {
                setCurrencyId(Number(value));
                setPlanId(null);
              }}
            >
              <SelectTrigger id="currency" className="w-full">
                <SelectValue placeholder="Choose a currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} · {formatPaise(item.pricePerCreditPaise)} / credit
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currency?.module ? (
              <p className="text-muted-foreground text-xs">
                Spendable only in the {currency.module.name} module.
              </p>
            ) : null}
          </div>

          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="plan">Bundle</TabsTrigger>
              <TabsTrigger value="quantity">Per credit</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'plan' ? (
            <div className="space-y-2" role="radiogroup" aria-label="Bundles">
              {currency?.plans.length ? (
                currency.plans.map((plan) => {
                  const isSelected = plan.id === planId;
                  const effective = Math.round(plan.pricePaise / plan.credits);
                  const saves = effective < (currency.pricePerCreditPaise ?? 0);

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setPlanId(plan.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-accent'
                          : 'hover:bg-muted border-border',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{plan.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {formatPaise(effective)} / credit
                          {saves ? ' · cheaper than buying singly' : ''}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {formatPaise(plan.pricePaise)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-sm">No bundles for this currency.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="quantity">Number of credits</Label>
              <Input
                id="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              {!isQuantityValid && quantity !== '' ? (
                <p className="text-destructive text-xs">Enter a whole number of credits.</p>
              ) : null}
            </div>
          )}

          <div className="bg-muted/60 flex items-center justify-between rounded-lg px-3 py-3">
            <span className="text-muted-foreground text-sm">
              {previewCredits === null
                ? 'Choose an option'
                : `${formatCredits(previewCredits)} credits`}
            </span>
            <span className="tabular text-lg font-semibold">
              {previewPaise === null ? '—' : formatPaise(previewPaise)}
            </span>
          </div>

          <InlineError error={error} />
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <CreditCard className="size-4" aria-hidden />
            )}
            Continue to Stripe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
