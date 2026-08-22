import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../sequelize';
import type { Currency } from './currency.model';
import type { CurrencyPlan } from './currency-plan.model';
import type { LedgerEntry } from './ledger-entry.model';
import type { User } from './user.model';
import type { Wallet } from './wallet.model';

export const PURCHASE_STATUSES = ['PENDING', 'PAID', 'FAILED', 'EXPIRED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/**
 * One attempt to buy credits with real money.
 *
 * Written as PENDING before the Checkout Session exists, so a webhook always has
 * a row to find — the session carries this purchase's id in its metadata, which
 * also covers the case where the webhook beats our write of the session id.
 *
 * credits, unitPricePaise and amountPaise are snapshots. Prices are configurable
 * rows, so without the snapshot a later price change would silently rewrite the
 * value of a past payment. The snapshot is also what the webhook checks
 * session.amount_total against before granting anything.
 */
export class CreditPurchase extends Model<
  InferAttributes<CreditPurchase>,
  InferCreationAttributes<CreditPurchase>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare walletId: ForeignKey<Wallet['id']>;
  declare currencyId: ForeignKey<Currency['id']>;
  declare planId: CreationOptional<ForeignKey<CurrencyPlan['id']> | null>;
  declare credits: number;
  declare unitPricePaise: number;
  declare amountPaise: number;
  declare status: CreationOptional<PurchaseStatus>;
  declare stripeCheckoutSessionId: CreationOptional<string | null>;
  declare stripeCheckoutUrl: CreationOptional<string | null>;
  declare stripePaymentIntentId: CreationOptional<string | null>;
  declare ledgerEntryId: CreationOptional<ForeignKey<LedgerEntry['id']> | null>;
  declare requestIdempotencyKey: CreationOptional<string | null>;
  declare paidAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare currency?: NonAttribute<Currency>;
  declare plan?: NonAttribute<CurrencyPlan>;
}

CreditPurchase.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    walletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    currencyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    planId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    credits: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    unitPricePaise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    amountPaise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: { type: DataTypes.ENUM(...PURCHASE_STATUSES), allowNull: false, defaultValue: 'PENDING' },
    stripeCheckoutSessionId: { type: DataTypes.STRING(191), allowNull: true },
    stripeCheckoutUrl: { type: DataTypes.STRING(2048), allowNull: true },
    stripePaymentIntentId: { type: DataTypes.STRING(191), allowNull: true },
    ledgerEntryId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    requestIdempotencyKey: { type: DataTypes.STRING(191), allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'credit_purchases', underscored: true },
);
