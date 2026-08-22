import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * Every Stripe event whose signature verified, recorded before it is acted on.
 *
 * The unique stripe_event_id is the first of the two idempotency layers: a
 * redelivery — Stripe's own retry, or a manual `stripe events resend` — collides
 * on insert, and the handler returns 200 without reprocessing.
 *
 * It is deliberately not the only layer. Stripe can report one payment through
 * more than one event id, so the guarantee that credits are granted exactly once
 * per payment comes from ledger_entries.idempotency_key. This table is what makes
 * duplicate deliveries cheap and gives an audit trail of what arrived and when.
 *
 * Events that fail signature verification never reach this table.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'stripe_webhook_events',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      stripe_event_id: {
        type: DataTypes.STRING(191),
        allowNull: false,
        unique: true,
      },
      type: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'),
        allowNull: false,
        defaultValue: 'RECEIVED',
      },
      payload: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      processed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' },
  );

  await queryInterface.addIndex('stripe_webhook_events', {
    name: 'ix_stripe_webhook_events_type_created',
    fields: ['type', 'created_at'],
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('stripe_webhook_events');
}
