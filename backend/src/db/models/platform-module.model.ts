import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../sequelize';
import type { Currency } from './currency.model';

/**
 * A platform module: campaigns, reports, discovery.
 *
 * Named PlatformModule rather than Module so it is never confused with a code
 * module. The table is still `modules`.
 */
export class PlatformModule extends Model<
  InferAttributes<PlatformModule>,
  InferCreationAttributes<PlatformModule>
> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare currency?: NonAttribute<Currency>;
}

PlatformModule.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'modules', underscored: true },
);
