import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../sequelize';

export const WEBHOOK_EVENT_STATUSES = ['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

/**
 * Every signature-verified Stripe event, recorded before it is acted on.
 *
 * The unique stripeEventId is the cheap first layer of idempotency: a redelivery
 * collides on insert and the handler returns 200 without doing the work again.
 * It is not the guarantee — Stripe can describe one payment with more than one
 * event id, so exactly-once granting rests on LedgerEntry.idempotencyKey.
 */
export class StripeWebhookEvent extends Model<
  InferAttributes<StripeWebhookEvent>,
  InferCreationAttributes<StripeWebhookEvent>
> {
  declare id: CreationOptional<number>;
  declare stripeEventId: string;
  declare type: string;
  declare status: CreationOptional<WebhookEventStatus>;
  declare payload: unknown;
  declare errorMessage: CreationOptional<string | null>;
  declare processedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

StripeWebhookEvent.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    stripeEventId: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    type: { type: DataTypes.STRING(128), allowNull: false },
    status: {
      type: DataTypes.ENUM(...WEBHOOK_EVENT_STATUSES),
      allowNull: false,
      defaultValue: 'RECEIVED',
    },
    payload: { type: DataTypes.JSON, allowNull: false },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    processedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'stripe_webhook_events', underscored: true },
);
