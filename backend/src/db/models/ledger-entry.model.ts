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
import type { Wallet } from './wallet.model';

export const LEDGER_ENTRY_TYPES = ['PURCHASE', 'CAMPAIGN_FUNDING'] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_REFERENCE_TYPES = ['CREDIT_PURCHASE', 'CAMPAIGN'] as const;
export type LedgerReferenceType = (typeof LEDGER_REFERENCE_TYPES)[number];

/**
 * An append-only record of every credit movement. The source of truth for balances.
 *
 * amount is signed, so per (wallet, currency):
 *   SUM(amount) === wallet_balances.balance
 * which is the acceptance criterion, checkable with one query.
 *
 * idempotencyKey is unique in the database. It is what makes "granted exactly
 * once per payment" and "funded at most once per campaign" guarantees rather than
 * conventions:
 *   purchase:<stripe_payment_intent_id>
 *   campaign_funding:<campaign_id>
 *
 * Rows are never updated, so the model has no updatedAt.
 */
export class LedgerEntry extends Model<
  InferAttributes<LedgerEntry>,
  InferCreationAttributes<LedgerEntry>
> {
  declare id: CreationOptional<number>;
  declare walletId: ForeignKey<Wallet['id']>;
  declare currencyId: ForeignKey<Currency['id']>;
  declare entryType: LedgerEntryType;
  declare amount: number;
  declare balanceAfter: number;
  declare referenceType: LedgerReferenceType;
  declare referenceId: number;
  declare idempotencyKey: string;
  declare description: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;

  declare currency?: NonAttribute<Currency>;
}

LedgerEntry.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    walletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    currencyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    entryType: { type: DataTypes.ENUM(...LEDGER_ENTRY_TYPES), allowNull: false },
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      get(this: LedgerEntry): number {
        return Number(this.getDataValue('amount'));
      },
    },
    balanceAfter: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      get(this: LedgerEntry): number {
        return Number(this.getDataValue('balanceAfter'));
      },
    },
    referenceType: { type: DataTypes.ENUM(...LEDGER_REFERENCE_TYPES), allowNull: false },
    referenceId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'ledger_entries', underscored: true, updatedAt: false },
);
