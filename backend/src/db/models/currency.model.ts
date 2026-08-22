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
import type { CurrencyPlan } from './currency-plan.model';
import type { PlatformModule } from './platform-module.model';

/**
 * A credit currency, bound to exactly one module.
 *
 * The binding lives here as data. Spending logic asks "which currency is bound to
 * my module?" instead of hardcoding a currency code, which is why adding the
 * Reports or Discovery spend path later needs no change to the wallet or ledger.
 */
export class Currency extends Model<InferAttributes<Currency>, InferCreationAttributes<Currency>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare moduleId: ForeignKey<PlatformModule['id']>;
  declare pricePerCreditPaise: number;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare module?: NonAttribute<PlatformModule>;
  declare plans?: NonAttribute<CurrencyPlan[]>;
}

Currency.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    moduleId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    pricePerCreditPaise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'currencies', underscored: true },
);
