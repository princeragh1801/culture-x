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
import type { LedgerEntry } from './ledger-entry.model';
import type { PlatformModule } from './platform-module.model';
import type { User } from './user.model';

export const CAMPAIGN_STATUSES = ['DRAFT', 'FUNDED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * A campaign, funded at most once.
 *
 * moduleId is stored rather than assumed, because it is half of the composite
 * foreign key (currency_id, module_id) -> currencies (id, module_id). That is
 * what makes funding a campaign with Report or Discovery Credits impossible at
 * the database level, not merely rejected by a service check.
 *
 * While DRAFT, currencyId is NULL and the composite key is inert (MySQL skips a
 * composite FK when any referencing column is NULL).
 */
export class Campaign extends Model<InferAttributes<Campaign>, InferCreationAttributes<Campaign>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare moduleId: ForeignKey<PlatformModule['id']>;
  declare name: string;
  declare status: CreationOptional<CampaignStatus>;
  declare currencyId: CreationOptional<ForeignKey<Currency['id']> | null>;
  declare fundedCredits: CreationOptional<number | null>;
  declare fundedAt: CreationOptional<Date | null>;
  declare ledgerEntryId: CreationOptional<ForeignKey<LedgerEntry['id']> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare currency?: NonAttribute<Currency>;
}

Campaign.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    moduleId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(191), allowNull: false },
    status: { type: DataTypes.ENUM(...CAMPAIGN_STATUSES), allowNull: false, defaultValue: 'DRAFT' },
    currencyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    fundedCredits: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      get(this: Campaign): number | null {
        const value = this.getDataValue('fundedCredits');
        return value === null || value === undefined ? null : Number(value);
      },
    },
    fundedAt: { type: DataTypes.DATE, allowNull: true },
    ledgerEntryId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'campaigns', underscored: true },
);
