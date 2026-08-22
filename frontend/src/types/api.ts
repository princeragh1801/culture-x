/** Shapes returned by the backend serialisers. */

export interface Module {
  id: number;
  code: 'campaigns' | 'reports' | 'discovery';
  name: string;
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  credits: number;
  pricePaise: number;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  module: Module | null;
  pricePerCreditPaise: number;
  plans: Plan[];
}

export interface CurrencyBalance {
  currency: Currency;
  balance: number;
}

export interface WalletResponse {
  walletId: number;
  balances: CurrencyBalance[];
}

export type LedgerEntryType = 'PURCHASE' | 'CAMPAIGN_FUNDING';

export interface LedgerEntry {
  id: number;
  currency: Pick<Currency, 'id' | 'code' | 'name'> | null;
  entryType: LedgerEntryType;
  /** Signed: positive for a purchase, negative for a spend. */
  amount: number;
  balanceAfter: number;
  referenceType: 'CREDIT_PURCHASE' | 'CAMPAIGN';
  referenceId: number;
  description: string | null;
  createdAt: string;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  page: number;
  pageSize: number;
  total: number;
}

export type PurchaseStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface Purchase {
  id: number;
  status: PurchaseStatus;
  credits: number;
  amountPaise: number;
  unitPricePaise: number;
  currency: Pick<Currency, 'id' | 'code' | 'name'> | null;
  plan: Pick<Plan, 'id' | 'code' | 'name'> | null;
  checkoutUrl: string | null;
  /** Set only once a verified webhook has granted the credits. */
  ledgerEntryId: number | null;
  paidAt: string | null;
  createdAt: string;
}

export type CampaignStatus = 'DRAFT' | 'FUNDED';

export interface Campaign {
  id: number;
  name: string;
  status: CampaignStatus;
  currency: Pick<Currency, 'id' | 'code' | 'name'> | null;
  fundedCredits: number | null;
  fundedAt: string | null;
  ledgerEntryId: number | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: { id: number; email: string; name: string | null; createdAt: string };
}
