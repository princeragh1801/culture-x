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

/** A pre-priced bundle of credits, e.g. 1,000 Campaign Credits for Rs 2,700. */
export class CurrencyPlan extends Model<
  InferAttributes<CurrencyPlan>,
  InferCreationAttributes<CurrencyPlan>
> {
  declare id: CreationOptional<number>;
  declare currencyId: ForeignKey<Currency['id']>;
  declare code: string;
  declare name: string;
  declare credits: number;
  declare pricePaise: number;
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare currency?: NonAttribute<Currency>;
}

CurrencyPlan.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    currencyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(64), allowNull: false },
    name: { type: DataTypes.STRING(128), allowNull: false },
    credits: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    pricePaise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'currency_plans', underscored: true },
);
