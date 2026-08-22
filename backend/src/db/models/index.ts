/**
 * Model registry and associations.
 *
 * Importing this module initialises every model against the shared Sequelize
 * instance and wires the associations. The schema itself is owned by the
 * migrations in ../migrations — sync() is never called.
 */
import { sequelize } from '../sequelize';
import { Campaign } from './campaign.model';
import { CreditPurchase } from './credit-purchase.model';
import { Currency } from './currency.model';
import { CurrencyPlan } from './currency-plan.model';
import { LedgerEntry } from './ledger-entry.model';
import { PlatformModule } from './platform-module.model';
import { StripeWebhookEvent } from './stripe-webhook-event.model';
import { User } from './user.model';
import { Wallet } from './wallet.model';
import { WalletBalance } from './wallet-balance.model';

// A module has exactly one currency (enforced by uq_currencies_module_id), which
// is what lets a module resolve "the currency I am allowed to spend".
PlatformModule.hasOne(Currency, { foreignKey: 'moduleId', as: 'currency' });
Currency.belongsTo(PlatformModule, { foreignKey: 'moduleId', as: 'module' });

Currency.hasMany(CurrencyPlan, { foreignKey: 'currencyId', as: 'plans' });
CurrencyPlan.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });

User.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet' });
Wallet.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Wallet.hasMany(WalletBalance, { foreignKey: 'walletId', as: 'balances' });
WalletBalance.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
WalletBalance.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });

Wallet.hasMany(LedgerEntry, { foreignKey: 'walletId', as: 'ledgerEntries' });
LedgerEntry.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
LedgerEntry.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });

User.hasMany(CreditPurchase, { foreignKey: 'userId', as: 'purchases' });
CreditPurchase.belongsTo(User, { foreignKey: 'userId', as: 'user' });
CreditPurchase.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });
CreditPurchase.belongsTo(CurrencyPlan, { foreignKey: 'planId', as: 'plan' });
CreditPurchase.belongsTo(LedgerEntry, { foreignKey: 'ledgerEntryId', as: 'ledgerEntry' });

User.hasMany(Campaign, { foreignKey: 'userId', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Campaign.belongsTo(PlatformModule, { foreignKey: 'moduleId', as: 'module' });
Campaign.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });
Campaign.belongsTo(LedgerEntry, { foreignKey: 'ledgerEntryId', as: 'ledgerEntry' });

export {
  sequelize,
  Campaign,
  CreditPurchase,
  Currency,
  CurrencyPlan,
  LedgerEntry,
  PlatformModule,
  StripeWebhookEvent,
  User,
  Wallet,
  WalletBalance,
};

export * from './campaign.model';
export * from './credit-purchase.model';
export * from './ledger-entry.model';
export * from './stripe-webhook-event.model';
