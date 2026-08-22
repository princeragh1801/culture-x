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

/**
 * A wallet's balance in one currency.
 *
 * This is a cached projection of the ledger, not the source of truth. The row is
 * also the concurrency control point: every spend takes a SELECT ... FOR UPDATE
 * on it first, which serialises competing spends for the same user and currency.
 *
 * The column is BIGINT UNSIGNED, so under STRICT_ALL_TABLES an update that would
 * go below zero raises ER_DATA_OUT_OF_RANGE and aborts the transaction.
 */
export class WalletBalance extends Model<
  InferAttributes<WalletBalance>,
  InferCreationAttributes<WalletBalance>
> {
  declare id: CreationOptional<number>;
  declare walletId: ForeignKey<Wallet['id']>;
  declare currencyId: ForeignKey<Currency['id']>;
  declare balance: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare wallet?: NonAttribute<Wallet>;
  declare currency?: NonAttribute<Currency>;
}

WalletBalance.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    walletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    currencyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    balance: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      // mysql2 hands back BIGINT as a string once it exceeds the safe integer
      // range; credits are whole numbers well inside it, so normalise on read.
      get(this: WalletBalance): number {
        return Number(this.getDataValue('balance'));
      },
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'wallet_balances', underscored: true },
);
